/*
 * SparrowFilter.h — SparrowShield Windows Minifilter Driver
 * Kernel-mode file system filter: real-time intercept and block
 *
 * Build with WDK 10 + Visual Studio 2022
 * Altitude: 328010 (FSFilter Anti-Virus range: 320000-329999)
 */

#pragma once

#include <fltKernel.h>

/* ── Identity ─────────────────────────────────────────────────── */
#define SPARROW_DRIVER_NAME        L"\\Device\\SparrowFilter"
#define SPARROW_SYMLINK_NAME       L"\\DosDevices\\SparrowFilter"
#define SPARROW_PORT_NAME          L"\\SparrowFilterPort"
#define SPARROW_ALTITUDE           L"328010"
#define SPARROW_POOL_TAG           'wPaS'   /* SaPw in memory */
#define SPARROW_MAX_RULES          256
#define SPARROW_RULE_MAX_CCH       512
#define SPARROW_QUEUE_SIZE         1024

/* ── IOCTL message opcodes (sent in FltSendMessage body) ─────── */
#define SPARROW_OP_GET_EVENT       0x01
#define SPARROW_OP_SET_BLOCK_RULE  0x02
#define SPARROW_OP_CLEAR_RULES     0x03

/* ── Event types ─────────────────────────────────────────────── */
#define SPARROW_EVT_CREATE         1
#define SPARROW_EVT_WRITE          2
#define SPARROW_EVT_RENAME         3
#define SPARROW_EVT_DELETE         4
#define SPARROW_EVT_EXEC           5

/* ── Action codes ────────────────────────────────────────────── */
#define SPARROW_ACTION_NOTIFY      0
#define SPARROW_ACTION_BLOCKED     1
#define SPARROW_ACTION_ALLOWED     2

/* ── Wire structures (shared with userspace) ─────────────────── */
#pragma pack(push, 1)

typedef struct _SPARROW_EVENT {
    ULONG         EventType;              /* SPARROW_EVT_* */
    ULONG         Pid;
    ULONG         Action;                 /* SPARROW_ACTION_* */
    FLOAT         ThreatScore;            /* 0.0 – 1.0 */
    WCHAR         FilePath[512];
    WCHAR         ProcessName[256];
    WCHAR         MitreId[32];            /* e.g. L"T1059" */
    LARGE_INTEGER Timestamp;              /* FILETIME (100-ns since 1601) */
} SPARROW_EVENT, *PSPARROW_EVENT;

typedef struct _SPARROW_MSG_IN {
    ULONG  Opcode;                        /* SPARROW_OP_* */
    WCHAR  Pattern[SPARROW_RULE_MAX_CCH]; /* for SET_BLOCK_RULE */
} SPARROW_MSG_IN, *PSPARROW_MSG_IN;

typedef struct _SPARROW_MSG_OUT {
    NTSTATUS     Status;
    SPARROW_EVENT Event;                  /* valid when Opcode == GET_EVENT */
    BOOLEAN      HasEvent;
} SPARROW_MSG_OUT, *PSPARROW_MSG_OUT;

#pragma pack(pop)

/* ── Global driver state ─────────────────────────────────────── */
typedef struct _SPARROW_GLOBALS {
    PFLT_FILTER         Filter;
    PFLT_PORT           ServerPort;
    PFLT_PORT           ClientPort;

    /* Circular event queue */
    SPARROW_EVENT       Queue[SPARROW_QUEUE_SIZE];
    ULONG               QueueHead;        /* next read position  */
    ULONG               QueueTail;        /* next write position */
    ULONG               QueueCount;
    KSPIN_LOCK          QueueLock;

    /* Block rules */
    WCHAR               BlockRules[SPARROW_MAX_RULES][SPARROW_RULE_MAX_CCH];
    ULONG               RuleCount;
    KSPIN_LOCK          RuleLock;

} SPARROW_GLOBALS, *PSPARROW_GLOBALS;

extern SPARROW_GLOBALS g_Sparrow;

/* ── Forward declarations ────────────────────────────────────── */
DRIVER_INITIALIZE DriverEntry;

NTSTATUS
FilterUnload(
    _In_ FLT_FILTER_UNLOAD_FLAGS Flags
);

NTSTATUS
InstanceSetup(
    _In_ PCFLT_RELATED_OBJECTS  FltObjects,
    _In_ FLT_INSTANCE_SETUP_REASON Reason,
    _In_ DEVICE_TYPE            VolumeDeviceType,
    _In_ FLT_FILESYSTEM_TYPE    VolumeFilesystemType
);

NTSTATUS
InstanceQueryTeardown(
    _In_ PCFLT_RELATED_OBJECTS        FltObjects,
    _In_ FLT_INSTANCE_QUERY_TEARDOWN_FLAGS Flags
);

VOID
InstanceTeardownStart(
    _In_ PCFLT_RELATED_OBJECTS FltObjects,
    _In_ FLT_INSTANCE_TEARDOWN_FLAGS   Flags
);

VOID
InstanceTeardownComplete(
    _In_ PCFLT_RELATED_OBJECTS FltObjects,
    _In_ FLT_INSTANCE_TEARDOWN_FLAGS   Flags
);

FLT_PREOP_CALLBACK_STATUS
SparrowPreCreate(
    _Inout_ PFLT_CALLBACK_DATA    Data,
    _In_    PCFLT_RELATED_OBJECTS FltObjects,
    _Flt_CompletionContext_Outptr_ PVOID *CompletionContext
);

FLT_PREOP_CALLBACK_STATUS
SparrowPreWrite(
    _Inout_ PFLT_CALLBACK_DATA    Data,
    _In_    PCFLT_RELATED_OBJECTS FltObjects,
    _Flt_CompletionContext_Outptr_ PVOID *CompletionContext
);

FLT_PREOP_CALLBACK_STATUS
SparrowPreSetInformation(
    _Inout_ PFLT_CALLBACK_DATA    Data,
    _In_    PCFLT_RELATED_OBJECTS FltObjects,
    _Flt_CompletionContext_Outptr_ PVOID *CompletionContext
);

NTSTATUS
SparrowMessageNotify(
    _In_opt_ PVOID  PortCookie,
    _In_opt_ PVOID  InputBuffer,
    _In_     ULONG  InputBufferLength,
    _Out_opt_ PVOID OutputBuffer,
    _In_     ULONG  OutputBufferLength,
    _Out_    PULONG ReturnOutputBufferLength
);

VOID
SparrowConnect(
    _In_  PFLT_PORT ClientPort,
    _In_  PVOID     ServerPortCookie,
    _In_  PVOID     ConnectionContext,
    _In_  ULONG     SizeOfContext,
    _Outptr_ PVOID *ConnectionPortCookie
);

VOID
SparrowDisconnect(
    _In_opt_ PVOID ConnectionCookie
);

/* ── Helpers ─────────────────────────────────────────────────── */
VOID
EnqueueEvent(
    _In_ PSPARROW_EVENT Event
);

BOOLEAN
DequeueEvent(
    _Out_ PSPARROW_EVENT Event
);

BOOLEAN
MatchesBlockRule(
    _In_ PUNICODE_STRING Path
);

FLOAT
ScoreThreat(
    _In_ PUNICODE_STRING Path
);

VOID
GetMitreForPath(
    _In_  PUNICODE_STRING Path,
    _Out_ PWCHAR          MitreIdOut,  /* at least 32 chars */
    _In_  ULONG           MitreIdLen
);
