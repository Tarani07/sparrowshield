# SparrowFilter — Windows Minifilter Driver

Real-time file system interception and blocking for SparrowShield.  
Altitude **328010** (FSFilter Anti-Virus range: 320000–329999).

---

## Prerequisites

| Tool | Where to get |
|------|-------------|
| Windows 10/11 x64 (target machine) | — |
| Visual Studio 2022 (Community+) | https://visualstudio.microsoft.com |
| WDK 10.0.22621.0 | https://learn.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk |
| WDK Extension for VS2022 | Installed by WDK installer — select the VS extension option |

Install VS2022 **first**, then WDK. The WDK installer links itself to the VS install automatically.

---

## Build

```bat
cd Downloads\sparrowshield\backend\agent\minifilter
build.bat
```

Output: `x64\Release\SparrowFilter.sys`

### Manual build (without the script)

```bat
msbuild SparrowFilter.vcxproj /p:Configuration=Release /p:Platform=x64
```

---

## Signing

### Development (test machine only)

Kernel-mode drivers on Windows 10/11 require a signature.  
For development, enable **test-signing** on the target machine (run as admin):

```cmd
bcdedit /set testsigning on
Restart-Computer
```

The build script creates and uses a self-signed test certificate automatically.

### Production (required for deployment)

1. Purchase an **EV (Extended Validation) code-signing certificate** from DigiCert, Sectigo, or GlobalSign.
2. Sign the `.sys` and `.cat` files with your EV cert:
   ```cmd
   signtool sign /v /s MY /n "Your Company" /fd sha256 ^
       /tr http://timestamp.digicert.com /td sha256 ^
       x64\Release\SparrowFilter.sys
   ```
3. Submit to **Microsoft Hardware Dev Center** for attestation signing:  
   https://partner.microsoft.com/dashboard/hardware  
   Upload your `.cab` file containing the signed `.sys` + INF + `.cat`.  
   Microsoft returns a cross-signed `.cat` valid for Windows 10/11.

---

## Installation

### Using pnputil (recommended)

```cmd
# As Administrator:
pnputil /add-driver SparrowFilter.inf /install
fltMC load SparrowFilter
```

### Manual sc.exe method

```cmd
sc create SparrowFilter ^
    binPath= C:\Windows\System32\drivers\SparrowFilter.sys ^
    type= kernel ^
    start= system ^
    group= "FSFilter Anti-Virus"

sc start SparrowFilter
```

### Verify

```cmd
fltMC filters          # Should show SparrowFilter at altitude 328010
fltMC instances        # Shows volumes the filter is attached to
sc query SparrowFilter # Service status
```

---

## Uninstall

```cmd
fltMC unload SparrowFilter
sc delete SparrowFilter
pnputil /delete-driver SparrowFilter.inf /uninstall
```

---

## Python Agent Integration

The minifilter exposes a communication port at `\\SparrowFilterPort`.

The Python agent (`agent_windows.py`) connects via `FilterConnectCommunicationPort` (wrapped in ctypes) and:

1. **Polls events**: sends `SPARROW_OP_GET_EVENT` every 500ms, receives `SPARROW_MSG_OUT` with an `SPARROW_EVENT` struct.
2. **Pushes block rules**: fetches rules from Supabase every 300s, sends `SPARROW_OP_CLEAR_RULES` then one `SPARROW_OP_SET_BLOCK_RULE` per pattern.

The driver enqueues events in a circular buffer (1024 entries). If the agent falls behind, the oldest entries are silently dropped — this is intentional (no kernel memory growth).

### Message format

```c
// Sent from userspace to kernel:
typedef struct _SPARROW_MSG_IN {
    ULONG  Opcode;        // 0x01=GET_EVENT, 0x02=SET_RULE, 0x03=CLEAR_RULES
    WCHAR  Pattern[512];  // for SET_RULE only
} SPARROW_MSG_IN;

// Received from kernel:
typedef struct _SPARROW_MSG_OUT {
    NTSTATUS     Status;
    SPARROW_EVENT Event;
    BOOLEAN      HasEvent;
} SPARROW_MSG_OUT;
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `fltMC load` returns error 1275 | Driver is not signed or test-signing is off. Run `bcdedit /set testsigning on` and reboot, or use an attestation-signed driver. |
| `fltMC filters` doesn't show SparrowFilter | INF not installed correctly. Re-run `pnputil /add-driver SparrowFilter.inf /install`. |
| Python agent shows "SparrowFilter port not found" | Driver isn't loaded. Check `sc query SparrowFilter`. |
| BSODs / system instability | Check `%SystemRoot%\Minidump\` with WinDbg + public symbols. The most common cause is accessing paged memory at DISPATCH_LEVEL. |

---

## Security Notes

- The driver runs at **kernel privilege**. A bug here can BSOD the machine.
- Only administrators can open the communication port (enforced by `FltBuildDefaultSecurityDescriptor`).
- Block rules are stored in kernel non-paged pool — keep rule count reasonable (< 256).
- In production, harden the communication port security descriptor to allow only the SYSTEM account.
