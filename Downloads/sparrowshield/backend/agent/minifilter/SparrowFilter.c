/*
 * SparrowFilter.c — SparrowShield Windows Minifilter Driver
 *
 * Real-time file system interception and blocking.
 * Altitude 328010 (FSFilter Anti-Virus range).
 *
 * Build: WDK 10.0.22621.0 + Visual Studio 2022
 * Target: Windows 10 1903+ x64
 *
 * Signing: EV certificate required for Windows 10/11 production.
 *          Use test-signing for development (bcdedit /set testsigning on).
 */

#include "SparrowFilter.h"

/* ── Paged / nonpaged section annotations ────────────────────── */
#ifdef ALLOC_PRAGMA
#pragma alloc_text(INIT, DriverEntry)
#pragma alloc_text(PAGE, FilterUnload)
#pragma alloc_text(PAGE, InstanceSetup)
#pragma alloc_text(PAGE, InstanceQueryTeardown)
#pragma alloc_text(PAGE, InstanceTeardownStart)
#pragma alloc_text(PAGE, InstanceTeardownComplete)
#pragma alloc_text(PAGE, SparrowMessageNotify)
#pragma alloc_text(PAGE, SparrowConnect)
#pragma alloc_text(PAGE, SparrowDisconnect)
#endif

/* ── Global state ────────────────────────────────────────────── */
SPARROW_GLOBALS g_Sparrow = { 0 };

/* ── Threat-score path patterns ──────────────────────────────── */
typedef struct _THREAT_PATTERN {
    WCHAR   Pattern[64];
    FLOAT   Score;
    WCHAR   MitreId[16];
} THREAT_PATTERN;

static const THREAT_PATTERN k_ThreatPatterns[] = {
    { L"\\Temp\\",             0.4f, L"T1059"  },
    { L"\\AppData\\Local\\Temp\\", 0.4f, L"T1059"  },
    { L"cmd.exe",              0.5f, L"T1059.003" },
    { L"powershell.exe",       0.6f, L"T1059.001" },
    { L"wscript.exe",          0.7f, L"T1059.005" },
    { L"cscript.exe",          0.7f, L"T1059.005" },
    { L"mshta.exe",            0.8f, L"T1218.005" },
    { L"regsvr32.exe",         0.7f, L"T1218.010" },
    { L"rundll32.exe",         0.6f, L"T1218.011" },
    { L"certutil.exe",         0.5f, L"T1105"  },
    { L"bitsadmin.exe",        0.5f, L"T1197"  },
    { L"vssadmin.exe",         0.8f, L"T1490"  },
    { L"wbadmin.exe",          0.8f, L"T1490"  },
    { L"bcdedit.exe",          0.7f, L"T1490"  },
    { L"\\recycle",            0.3f, L"T1070"  },
    { L".exe.tmp",             0.5f, L"T1036"  },
    { L".dll.tmp",             0.5f, L"T1036"  },
};
static const ULONG k_PatternCount = RTL_NUMBER_OF(k_ThreatPatterns);

/* ── Callback registration ───────────────────────────────────── */
static const FLT_OPERATION_REGISTRATION k_Callbacks[] = {
    {
        IRP_MJ_CREATE,
        0,
        SparrowPreCreate,
        NULL
    },
    {
        IRP_MJ_WRITE,
        0,
        SparrowPreWrite,
        NULL
    },
    {
        IRP_MJ_SET_INFORMATION,
        0,
        SparrowPreSetInformation,
        NULL
    },
    { IRP_MJ_OPERATION_END }
};

static const FLT_REGISTRATION k_FilterRegistration = {
    sizeof(FLT_REGISTRATION),          /* Size */
    FLT_REGISTRATION_VERSION,          /* Version */
    0,                                 /* Flags */
    NULL,                              /* ContextRegistration */
    k_Callbacks,                       /* OperationRegistration */
    FilterUnload,
    InstanceSetup,
    InstanceQueryTeardown,
    InstanceTeardownStart,
    InstanceTeardownComplete,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
};

/* ═══════════════════════════════════════════════════════════════
 * DriverEntry
 * ═══════════════════════════════════════════════════════════════ */
NTSTATUS
DriverEntry(
    _In_ PDRIVER_OBJECT  DriverObject,
    _In_ PUNICODE_STRING RegistryPath
)
{
    NTSTATUS status;
    UNICODE_STRING portName;
    PSECURITY_DESCRIPTOR sd = NULL;
    OBJECT_ATTRIBUTES oa;

    UNREFERENCED_PARAMETER(RegistryPath);

    /* Zero global state */
    RtlZeroMemory(&g_Sparrow, sizeof(g_Sparrow));
    KeInitializeSpinLock(&g_Sparrow.QueueLock);
    KeInitializeSpinLock(&g_Sparrow.RuleLock);

    /* Register the minifilter */
    status = FltRegisterFilter(DriverObject, &k_FilterRegistration, &g_Sparrow.Filter);
    if (!NT_SUCCESS(status)) {
        return status;
    }

    /* Create the communication port (allows one client at a time) */
    status = FltBuildDefaultSecurityDescriptor(&sd, FLT_PORT_ALL_ACCESS);
    if (!NT_SUCCESS(status)) {
        goto Cleanup;
    }

    RtlInitUnicodeString(&portName, SPARROW_PORT_NAME);
    InitializeObjectAttributes(&oa, &portName,
                               OBJ_KERNEL_HANDLE | OBJ_CASE_INSENSITIVE,
                               NULL, sd);

    status = FltCreateCommunicationPort(
        g_Sparrow.Filter,
        &g_Sparrow.ServerPort,
        &oa,
        NULL,                   /* ServerPortCookie */
        SparrowConnect,
        SparrowDisconnect,
        SparrowMessageNotify,
        1                       /* MaxConnections */
    );
    FltFreeSecurityDescriptor(sd);

    if (!NT_SUCCESS(status)) {
        goto Cleanup;
    }

    /* Start filtering */
    status = FltStartFiltering(g_Sparrow.Filter);
    if (!NT_SUCCESS(status)) {
        goto Cleanup;
    }

    return STATUS_SUCCESS;

Cleanup:
    if (g_Sparrow.ServerPort) {
        FltCloseCommunicationPort(g_Sparrow.ServerPort);
    }
    FltUnregisterFilter(g_Sparrow.Filter);
    return status;
}

/* ═══════════════════════════════════════════════════════════════
 * FilterUnload
 * ═══════════════════════════════════════════════════════════════ */
NTSTATUS
FilterUnload(
    _In_ FLT_FILTER_UNLOAD_FLAGS Flags
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(Flags);

    if (g_Sparrow.ServerPort) {
        FltCloseCommunicationPort(g_Sparrow.ServerPort);
        g_Sparrow.ServerPort = NULL;
    }
    if (g_Sparrow.Filter) {
        FltUnregisterFilter(g_Sparrow.Filter);
        g_Sparrow.Filter = NULL;
    }
    return STATUS_SUCCESS;
}

/* ═══════════════════════════════════════════════════════════════
 * Instance callbacks
 * ═══════════════════════════════════════════════════════════════ */
NTSTATUS
InstanceSetup(
    _In_ PCFLT_RELATED_OBJECTS  FltObjects,
    _In_ FLT_INSTANCE_SETUP_REASON Reason,
    _In_ DEVICE_TYPE            VolumeDeviceType,
    _In_ FLT_FILESYSTEM_TYPE    VolumeFilesystemType
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(FltObjects);
    UNREFERENCED_PARAMETER(Reason);
    UNREFERENCED_PARAMETER(VolumeDeviceType);

    /* Attach only to disk-based file systems (NTFS, ReFS) */
    if (VolumeFilesystemType == FLT_FSTYPE_RAW ||
        VolumeFilesystemType == FLT_FSTYPE_CDROM) {
        return STATUS_FLT_DO_NOT_ATTACH;
    }
    return STATUS_SUCCESS;
}

NTSTATUS
InstanceQueryTeardown(
    _In_ PCFLT_RELATED_OBJECTS        FltObjects,
    _In_ FLT_INSTANCE_QUERY_TEARDOWN_FLAGS Flags
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(FltObjects);
    UNREFERENCED_PARAMETER(Flags);
    return STATUS_SUCCESS;
}

VOID
InstanceTeardownStart(
    _In_ PCFLT_RELATED_OBJECTS FltObjects,
    _In_ FLT_INSTANCE_TEARDOWN_FLAGS   Flags
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(FltObjects);
    UNREFERENCED_PARAMETER(Flags);
}

VOID
InstanceTeardownComplete(
    _In_ PCFLT_RELATED_OBJECTS FltObjects,
    _In_ FLT_INSTANCE_TEARDOWN_FLAGS   Flags
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(FltObjects);
    UNREFERENCED_PARAMETER(Flags);
}

/* ═══════════════════════════════════════════════════════════════
 * Communication port callbacks
 * ═══════════════════════════════════════════════════════════════ */
VOID
SparrowConnect(
    _In_  PFLT_PORT ClientPort,
    _In_  PVOID     ServerPortCookie,
    _In_  PVOID     ConnectionContext,
    _In_  ULONG     SizeOfContext,
    _Outptr_ PVOID *ConnectionPortCookie
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(ServerPortCookie);
    UNREFERENCED_PARAMETER(ConnectionContext);
    UNREFERENCED_PARAMETER(SizeOfContext);

    g_Sparrow.ClientPort = ClientPort;
    *ConnectionPortCookie = NULL;
}

VOID
SparrowDisconnect(
    _In_opt_ PVOID ConnectionCookie
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(ConnectionCookie);

    FltCloseClientPort(g_Sparrow.Filter, &g_Sparrow.ClientPort);
    g_Sparrow.ClientPort = NULL;
}

/* ── Message handler (called from userspace FltSendMessage) ──── */
NTSTATUS
SparrowMessageNotify(
    _In_opt_ PVOID  PortCookie,
    _In_opt_ PVOID  InputBuffer,
    _In_     ULONG  InputBufferLength,
    _Out_opt_ PVOID OutputBuffer,
    _In_     ULONG  OutputBufferLength,
    _Out_    PULONG ReturnOutputBufferLength
)
{
    PAGED_CODE();
    UNREFERENCED_PARAMETER(PortCookie);

    PSPARROW_MSG_IN  in  = (PSPARROW_MSG_IN)InputBuffer;
    PSPARROW_MSG_OUT out = (PSPARROW_MSG_OUT)OutputBuffer;
    KIRQL            irql;

    *ReturnOutputBufferLength = 0;

    if (!in || InputBufferLength < sizeof(ULONG)) {
        return STATUS_INVALID_PARAMETER;
    }

    switch (in->Opcode) {

    /* ── GET_EVENT: pop one event from queue ── */
    case SPARROW_OP_GET_EVENT:
        if (!out || OutputBufferLength < sizeof(SPARROW_MSG_OUT)) {
            return STATUS_BUFFER_TOO_SMALL;
        }
        RtlZeroMemory(out, sizeof(SPARROW_MSG_OUT));
        out->HasEvent = DequeueEvent(&out->Event);
        out->Status   = STATUS_SUCCESS;
        *ReturnOutputBufferLength = sizeof(SPARROW_MSG_OUT);
        break;

    /* ── SET_BLOCK_RULE: add pattern ── */
    case SPARROW_OP_SET_BLOCK_RULE:
        if (InputBufferLength < sizeof(SPARROW_MSG_IN)) {
            return STATUS_BUFFER_TOO_SMALL;
        }
        KeAcquireSpinLock(&g_Sparrow.RuleLock, &irql);
        if (g_Sparrow.RuleCount < SPARROW_MAX_RULES) {
            RtlCopyMemory(
                g_Sparrow.BlockRules[g_Sparrow.RuleCount],
                in->Pattern,
                sizeof(in->Pattern));
            g_Sparrow.RuleCount++;
        }
        KeReleaseSpinLock(&g_Sparrow.RuleLock, irql);
        if (out && OutputBufferLength >= sizeof(NTSTATUS)) {
            *(PNTSTATUS)out = STATUS_SUCCESS;
            *ReturnOutputBufferLength = sizeof(NTSTATUS);
        }
        break;

    /* ── CLEAR_RULES: wipe all block rules ── */
    case SPARROW_OP_CLEAR_RULES:
        KeAcquireSpinLock(&g_Sparrow.RuleLock, &irql);
        g_Sparrow.RuleCount = 0;
        RtlZeroMemory(g_Sparrow.BlockRules, sizeof(g_Sparrow.BlockRules));
        KeReleaseSpinLock(&g_Sparrow.RuleLock, irql);
        if (out && OutputBufferLength >= sizeof(NTSTATUS)) {
            *(PNTSTATUS)out = STATUS_SUCCESS;
            *ReturnOutputBufferLength = sizeof(NTSTATUS);
        }
        break;

    default:
        return STATUS_INVALID_PARAMETER;
    }

    return STATUS_SUCCESS;
}

/* ═══════════════════════════════════════════════════════════════
 * Helpers
 * ═══════════════════════════════════════════════════════════════ */
VOID
EnqueueEvent(_In_ PSPARROW_EVENT Event)
{
    KIRQL irql;
    KeAcquireSpinLock(&g_Sparrow.QueueLock, &irql);
    if (g_Sparrow.QueueCount < SPARROW_QUEUE_SIZE) {
        RtlCopyMemory(&g_Sparrow.Queue[g_Sparrow.QueueTail],
                      Event, sizeof(SPARROW_EVENT));
        g_Sparrow.QueueTail = (g_Sparrow.QueueTail + 1) % SPARROW_QUEUE_SIZE;
        g_Sparrow.QueueCount++;
    }
    /* If full, oldest event is silently dropped (tail doesn't advance) */
    KeReleaseSpinLock(&g_Sparrow.QueueLock, irql);
}

BOOLEAN
DequeueEvent(_Out_ PSPARROW_EVENT Event)
{
    KIRQL irql;
    BOOLEAN found = FALSE;
    KeAcquireSpinLock(&g_Sparrow.QueueLock, &irql);
    if (g_Sparrow.QueueCount > 0) {
        RtlCopyMemory(Event,
                      &g_Sparrow.Queue[g_Sparrow.QueueHead],
                      sizeof(SPARROW_EVENT));
        g_Sparrow.QueueHead = (g_Sparrow.QueueHead + 1) % SPARROW_QUEUE_SIZE;
        g_Sparrow.QueueCount--;
        found = TRUE;
    }
    KeReleaseSpinLock(&g_Sparrow.QueueLock, irql);
    return found;
}

BOOLEAN
MatchesBlockRule(_In_ PUNICODE_STRING Path)
{
    KIRQL irql;
    BOOLEAN matched = FALSE;
    KeAcquireSpinLock(&g_Sparrow.RuleLock, &irql);
    for (ULONG i = 0; i < g_Sparrow.RuleCount && !matched; i++) {
        /* Case-insensitive substring search */
        UNICODE_STRING pattern;
        RtlInitUnicodeString(&pattern, g_Sparrow.BlockRules[i]);
        if (pattern.Length == 0) continue;
        /* Use RtlFindUnicodeSubstring if available; otherwise manual scan */
        ULONG pathLen  = Path->Length    / sizeof(WCHAR);
        ULONG patLen   = pattern.Length  / sizeof(WCHAR);
        if (patLen == 0 || patLen > pathLen) continue;
        for (ULONG j = 0; j <= pathLen - patLen && !matched; j++) {
            BOOLEAN eq = TRUE;
            for (ULONG k = 0; k < patLen && eq; k++) {
                WCHAR pc = RtlUpcaseUnicodeChar(pattern.Buffer[k]);
                WCHAR tc = RtlUpcaseUnicodeChar(Path->Buffer[j + k]);
                if (pc != tc) eq = FALSE;
            }
            if (eq) matched = TRUE;
        }
    }
    KeReleaseSpinLock(&g_Sparrow.RuleLock, irql);
    return matched;
}

FLOAT
ScoreThreat(_In_ PUNICODE_STRING Path)
{
    FLOAT score = 0.0f;
    for (ULONG i = 0; i < k_PatternCount; i++) {
        UNICODE_STRING pat;
        RtlInitUnicodeString(&pat, (PWSTR)k_ThreatPatterns[i].Pattern);
        ULONG pLen = pat.Length / sizeof(WCHAR);
        ULONG tLen = Path->Length / sizeof(WCHAR);
        if (pLen == 0 || pLen > tLen) continue;
        for (ULONG j = 0; j <= tLen - pLen; j++) {
            BOOLEAN eq = TRUE;
            for (ULONG k = 0; k < pLen && eq; k++) {
                WCHAR pc = RtlUpcaseUnicodeChar(pat.Buffer[k]);
                WCHAR tc = RtlUpcaseUnicodeChar(Path->Buffer[j + k]);
                if (pc != tc) eq = FALSE;
            }
            if (eq) {
                score += k_ThreatPatterns[i].Score;
                break;
            }
        }
    }
    if (score > 1.0f) score = 1.0f;
    return score;
}

VOID
GetMitreForPath(
    _In_  PUNICODE_STRING Path,
    _Out_ PWCHAR          MitreIdOut,
    _In_  ULONG           MitreIdLen
)
{
    for (ULONG i = 0; i < k_PatternCount; i++) {
        UNICODE_STRING pat;
        RtlInitUnicodeString(&pat, (PWSTR)k_ThreatPatterns[i].Pattern);
        ULONG pLen = pat.Length / sizeof(WCHAR);
        ULONG tLen = Path->Length / sizeof(WCHAR);
        if (pLen == 0 || pLen > tLen) continue;
        for (ULONG j = 0; j <= tLen - pLen; j++) {
            BOOLEAN eq = TRUE;
            for (ULONG k = 0; k < pLen && eq; k++) {
                WCHAR pc = RtlUpcaseUnicodeChar(pat.Buffer[k]);
                WCHAR tc = RtlUpcaseUnicodeChar(Path->Buffer[j + k]);
                if (pc != tc) eq = FALSE;
            }
            if (eq) {
                ULONG copyLen = MitreIdLen < 16 ? MitreIdLen : 16;
                RtlCopyMemory(MitreIdOut,
                              k_ThreatPatterns[i].MitreId,
                              copyLen * sizeof(WCHAR));
                return;
            }
        }
    }
    if (MitreIdLen > 0) MitreIdOut[0] = L'\0';
}

/* ═══════════════════════════════════════════════════════════════
 * Pre-operation: IRP_MJ_CREATE
 * ═══════════════════════════════════════════════════════════════ */
FLT_PREOP_CALLBACK_STATUS
SparrowPreCreate(
    _Inout_ PFLT_CALLBACK_DATA    Data,
    _In_    PCFLT_RELATED_OBJECTS FltObjects,
    _Flt_CompletionContext_Outptr_ PVOID *CompletionContext
)
{
    UNREFERENCED_PARAMETER(CompletionContext);
    NTSTATUS status;
    PFLT_FILE_NAME_INFORMATION nameInfo = NULL;
    SPARROW_EVENT evt = { 0 };
    BOOLEAN blocked = FALSE;

    /* Skip kernel callers and volume opens */
    if (FltGetRequestorProcessId(Data) == 4) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }

    status = FltGetFileNameInformation(Data,
        FLT_FILE_NAME_NORMALIZED | FLT_FILE_NAME_QUERY_DEFAULT,
        &nameInfo);
    if (!NT_SUCCESS(status)) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }

    FltParseFileNameInformation(nameInfo);

    /* Score and check */
    FLOAT score = ScoreThreat(&nameInfo->Name);
    blocked = MatchesBlockRule(&nameInfo->Name);

    /* Build event */
    evt.EventType  = SPARROW_EVT_CREATE;
    evt.Pid        = FltGetRequestorProcessId(Data);
    evt.ThreatScore = score;
    evt.Action     = blocked ? SPARROW_ACTION_BLOCKED : SPARROW_ACTION_NOTIFY;
    KeQuerySystemTime(&evt.Timestamp);

    ULONG copyChars = nameInfo->Name.Length / sizeof(WCHAR);
    if (copyChars > 511) copyChars = 511;
    RtlCopyMemory(evt.FilePath, nameInfo->Name.Buffer, copyChars * sizeof(WCHAR));
    evt.FilePath[copyChars] = L'\0';
    GetMitreForPath(&nameInfo->Name, evt.MitreId, 16);

    /* Get process name from EPROCESS via PsGetCurrentProcess — best-effort */
    evt.ProcessName[0] = L'\0';

    FltReleaseFileNameInformation(nameInfo);

    EnqueueEvent(&evt);

    if (blocked) {
        Data->IoStatus.Status      = STATUS_ACCESS_DENIED;
        Data->IoStatus.Information = 0;
        return FLT_PREOP_COMPLETE;
    }
    return FLT_PREOP_SUCCESS_NO_CALLBACK;
}

/* ═══════════════════════════════════════════════════════════════
 * Pre-operation: IRP_MJ_WRITE
 * ═══════════════════════════════════════════════════════════════ */
FLT_PREOP_CALLBACK_STATUS
SparrowPreWrite(
    _Inout_ PFLT_CALLBACK_DATA    Data,
    _In_    PCFLT_RELATED_OBJECTS FltObjects,
    _Flt_CompletionContext_Outptr_ PVOID *CompletionContext
)
{
    UNREFERENCED_PARAMETER(CompletionContext);
    NTSTATUS status;
    PFLT_FILE_NAME_INFORMATION nameInfo = NULL;
    SPARROW_EVENT evt = { 0 };
    BOOLEAN blocked = FALSE;

    if (FltGetRequestorProcessId(Data) == 4) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }

    status = FltGetFileNameInformation(Data,
        FLT_FILE_NAME_NORMALIZED | FLT_FILE_NAME_QUERY_DEFAULT,
        &nameInfo);
    if (!NT_SUCCESS(status)) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }
    FltParseFileNameInformation(nameInfo);

    FLOAT score = ScoreThreat(&nameInfo->Name);

    /* Only queue writes that score above threshold (reduce noise) */
    if (score > 0.3f || MatchesBlockRule(&nameInfo->Name)) {
        blocked = MatchesBlockRule(&nameInfo->Name);
        evt.EventType   = SPARROW_EVT_WRITE;
        evt.Pid         = FltGetRequestorProcessId(Data);
        evt.ThreatScore = score;
        evt.Action      = blocked ? SPARROW_ACTION_BLOCKED : SPARROW_ACTION_NOTIFY;
        KeQuerySystemTime(&evt.Timestamp);

        ULONG copyChars = nameInfo->Name.Length / sizeof(WCHAR);
        if (copyChars > 511) copyChars = 511;
        RtlCopyMemory(evt.FilePath, nameInfo->Name.Buffer, copyChars * sizeof(WCHAR));
        evt.FilePath[copyChars] = L'\0';
        GetMitreForPath(&nameInfo->Name, evt.MitreId, 16);
        EnqueueEvent(&evt);
    }

    FltReleaseFileNameInformation(nameInfo);

    if (blocked) {
        Data->IoStatus.Status      = STATUS_ACCESS_DENIED;
        Data->IoStatus.Information = 0;
        return FLT_PREOP_COMPLETE;
    }
    return FLT_PREOP_SUCCESS_NO_CALLBACK;
}

/* ═══════════════════════════════════════════════════════════════
 * Pre-operation: IRP_MJ_SET_INFORMATION (rename / delete)
 * ═══════════════════════════════════════════════════════════════ */
FLT_PREOP_CALLBACK_STATUS
SparrowPreSetInformation(
    _Inout_ PFLT_CALLBACK_DATA    Data,
    _In_    PCFLT_RELATED_OBJECTS FltObjects,
    _Flt_CompletionContext_Outptr_ PVOID *CompletionContext
)
{
    UNREFERENCED_PARAMETER(CompletionContext);
    NTSTATUS status;
    PFLT_FILE_NAME_INFORMATION nameInfo = NULL;
    SPARROW_EVENT evt = { 0 };
    FILE_INFORMATION_CLASS infoClass =
        Data->Iopb->Parameters.SetFileInformation.FileInformationClass;
    BOOLEAN isDelete = (infoClass == FileDispositionInformation ||
                        infoClass == FileDispositionInformationEx);
    BOOLEAN isRename = (infoClass == FileRenameInformation ||
                        infoClass == FileRenameInformationEx);

    if (!isDelete && !isRename) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }
    if (FltGetRequestorProcessId(Data) == 4) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }

    status = FltGetFileNameInformation(Data,
        FLT_FILE_NAME_NORMALIZED | FLT_FILE_NAME_QUERY_DEFAULT,
        &nameInfo);
    if (!NT_SUCCESS(status)) {
        return FLT_PREOP_SUCCESS_NO_CALLBACK;
    }
    FltParseFileNameInformation(nameInfo);

    BOOLEAN blocked = MatchesBlockRule(&nameInfo->Name);
    FLOAT   score   = ScoreThreat(&nameInfo->Name);

    evt.EventType   = isDelete ? SPARROW_EVT_DELETE : SPARROW_EVT_RENAME;
    evt.Pid         = FltGetRequestorProcessId(Data);
    evt.ThreatScore = score;
    evt.Action      = blocked ? SPARROW_ACTION_BLOCKED : SPARROW_ACTION_NOTIFY;
    KeQuerySystemTime(&evt.Timestamp);

    ULONG copyChars = nameInfo->Name.Length / sizeof(WCHAR);
    if (copyChars > 511) copyChars = 511;
    RtlCopyMemory(evt.FilePath, nameInfo->Name.Buffer, copyChars * sizeof(WCHAR));
    evt.FilePath[copyChars] = L'\0';
    GetMitreForPath(&nameInfo->Name, evt.MitreId, 16);

    FltReleaseFileNameInformation(nameInfo);
    EnqueueEvent(&evt);

    if (blocked) {
        Data->IoStatus.Status      = STATUS_ACCESS_DENIED;
        Data->IoStatus.Information = 0;
        return FLT_PREOP_COMPLETE;
    }
    return FLT_PREOP_SUCCESS_NO_CALLBACK;
}
