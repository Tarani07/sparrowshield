"""
MITRE ATT&CK Enterprise technique mapper.
Maps SparrowShield behavioral detections to ATT&CK technique IDs.
Data sourced from https://attack.mitre.org (free, public domain).
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import List, Optional

@dataclass(frozen=True)
class Technique:
    technique_id: str     # e.g. "T1059.001"
    name: str             # e.g. "PowerShell"
    tactic: str           # e.g. "Execution"
    tactic_id: str        # e.g. "TA0002"
    url: str              # e.g. "https://attack.mitre.org/techniques/T1059/001/"

# ── Static ATT&CK Enterprise mapping ──────────────────────────────────────────
# Curated subset covering the techniques SparrowShield detects.
TECHNIQUES: dict[str, Technique] = {t.technique_id: t for t in [
    # Execution
    Technique("T1059.001", "PowerShell",                         "Execution",          "TA0002", "https://attack.mitre.org/techniques/T1059/001/"),
    Technique("T1059.003", "Windows Command Shell",              "Execution",          "TA0002", "https://attack.mitre.org/techniques/T1059/003/"),
    Technique("T1059.005", "Visual Basic",                       "Execution",          "TA0002", "https://attack.mitre.org/techniques/T1059/005/"),
    Technique("T1059.007", "JavaScript",                         "Execution",          "TA0002", "https://attack.mitre.org/techniques/T1059/007/"),
    Technique("T1204.002", "Malicious File",                     "Execution",          "TA0002", "https://attack.mitre.org/techniques/T1204/002/"),
    Technique("T1569.002", "Service Execution",                  "Execution",          "TA0002", "https://attack.mitre.org/techniques/T1569/002/"),
    Technique("T1218.005", "Mshta",                              "Defense Evasion",    "TA0005", "https://attack.mitre.org/techniques/T1218/005/"),
    Technique("T1218.010", "Regsvr32",                           "Defense Evasion",    "TA0005", "https://attack.mitre.org/techniques/T1218/010/"),
    # Persistence
    Technique("T1543.003", "Windows Service",                    "Persistence",        "TA0003", "https://attack.mitre.org/techniques/T1543/003/"),
    Technique("T1547.001", "Registry Run Keys / Startup Folder", "Persistence",        "TA0003", "https://attack.mitre.org/techniques/T1547/001/"),
    Technique("T1543.004", "Launch Daemon",                      "Persistence",        "TA0003", "https://attack.mitre.org/techniques/T1543/004/"),
    # Privilege Escalation
    Technique("T1548.002", "Bypass User Account Control",        "Privilege Escalation","TA0004","https://attack.mitre.org/techniques/T1548/002/"),
    # Defense Evasion
    Technique("T1027.010", "Command Obfuscation",                "Defense Evasion",    "TA0005", "https://attack.mitre.org/techniques/T1027/010/"),
    Technique("T1036.007", "Double File Extension",              "Defense Evasion",    "TA0005", "https://attack.mitre.org/techniques/T1036/007/"),
    Technique("T1112",     "Modify Registry",                    "Defense Evasion",    "TA0005", "https://attack.mitre.org/techniques/T1112/"),
    Technique("T1562.001", "Disable or Modify Tools",            "Defense Evasion",    "TA0005", "https://attack.mitre.org/techniques/T1562/001/"),
    # Credential Access
    Technique("T1003.001", "LSASS Memory",                       "Credential Access",  "TA0006", "https://attack.mitre.org/techniques/T1003/001/"),
    Technique("T1555",     "Credentials from Password Stores",   "Credential Access",  "TA0006", "https://attack.mitre.org/techniques/T1555/"),
    Technique("T1110",     "Brute Force",                        "Credential Access",  "TA0006", "https://attack.mitre.org/techniques/T1110/"),
    # Discovery
    Technique("T1057",     "Process Discovery",                  "Discovery",          "TA0007", "https://attack.mitre.org/techniques/T1057/"),
    Technique("T1083",     "File and Directory Discovery",       "Discovery",          "TA0007", "https://attack.mitre.org/techniques/T1083/"),
    Technique("T1082",     "System Information Discovery",       "Discovery",          "TA0007", "https://attack.mitre.org/techniques/T1082/"),
    # Lateral Movement
    Technique("T1021.002", "SMB/Windows Admin Shares",           "Lateral Movement",   "TA0008", "https://attack.mitre.org/techniques/T1021/002/"),
    Technique("T1080",     "Taint Shared Content",               "Lateral Movement",   "TA0008", "https://attack.mitre.org/techniques/T1080/"),
    # Collection
    Technique("T1005",     "Data from Local System",             "Collection",         "TA0009", "https://attack.mitre.org/techniques/T1005/"),
    # C2
    Technique("T1071.001", "Web Protocols",                      "Command and Control","TA0011", "https://attack.mitre.org/techniques/T1071/001/"),
    Technique("T1071.004", "DNS",                                "Command and Control","TA0011", "https://attack.mitre.org/techniques/T1071/004/"),
    Technique("T1095",     "Non-Application Layer Protocol",     "Command and Control","TA0011", "https://attack.mitre.org/techniques/T1095/"),
    Technique("T1571",     "Non-Standard Port",                  "Command and Control","TA0011", "https://attack.mitre.org/techniques/T1571/"),
    Technique("T1573",     "Encrypted Channel",                  "Command and Control","TA0011", "https://attack.mitre.org/techniques/T1573/"),
    # Exfiltration
    Technique("T1041",     "Exfiltration Over C2 Channel",       "Exfiltration",       "TA0010", "https://attack.mitre.org/techniques/T1041/"),
    Technique("T1048",     "Exfiltration Over Alternative Protocol","Exfiltration",    "TA0010", "https://attack.mitre.org/techniques/T1048/"),
    # Impact
    Technique("T1486",     "Data Encrypted for Impact",          "Impact",             "TA0040", "https://attack.mitre.org/techniques/T1486/"),
    Technique("T1490",     "Inhibit System Recovery",            "Impact",             "TA0040", "https://attack.mitre.org/techniques/T1490/"),
    Technique("T1496",     "Resource Hijacking",                 "Impact",             "TA0040", "https://attack.mitre.org/techniques/T1496/"),
    Technique("T1489",     "Service Stop",                       "Impact",             "TA0040", "https://attack.mitre.org/techniques/T1489/"),
]}

# ── Rule-based technique detection ────────────────────────────────────────────

def _cmd(event: dict) -> str:
    return (event.get("cmdline") or "").lower()

def _path(event: dict) -> str:
    return (event.get("image_path") or event.get("file_path") or "").lower()

def _proc(event: dict) -> str:
    return (event.get("process_name") or "").lower()

def _dst_port(event: dict) -> int:
    return int(event.get("dst_port") or 0)

def map_event(event: dict) -> List[Technique]:
    """Return all matching ATT&CK techniques for an OCSF event dict."""
    matched: list[str] = []
    cmd = _cmd(event)
    path = _path(event)
    proc = _proc(event)
    port = _dst_port(event)

    # ── Execution ──
    if any(x in proc or x in cmd for x in ["powershell", "pwsh"]):
        if any(x in cmd for x in ["-enc", "-encodedcommand", "-nop", "-w hidden"]):
            matched.append("T1059.001")  # PowerShell
            matched.append("T1027.010")  # Command Obfuscation
        else:
            matched.append("T1059.001")
    if any(x in proc for x in ["cmd.exe", "command.com"]):
        matched.append("T1059.003")
    if any(x in proc for x in ["wscript.exe", "cscript.exe"]):
        matched.append("T1059.005")
    if "mshta" in proc:
        matched.append("T1218.005")
    if "regsvr32" in proc:
        matched.append("T1218.010")

    # ── Double extension ──
    if re.search(r'\.(pdf|doc|docx|xls|xlsx|ppt|pptx)\.(exe|bat|ps1|vbs|js)$', path):
        matched.append("T1036.007")

    # ── Credential Access ──
    if any(x in cmd for x in ["mimikatz", "sekurlsa", "lsass", "hashdump", "wce.exe"]):
        matched.append("T1003.001")
    if any(x in cmd for x in ["credentials", "vault", "keychain", "password"]):
        matched.append("T1555")

    # ── Inhibit System Recovery ──
    if any(x in cmd for x in ["vssadmin", "wbadmin", "diskshadow", "bcdedit"]):
        matched.append("T1490")

    # ── Ransomware / Impact ──
    if re.search(r'\.(locked|encrypted|crypt|zepto|wncry|cerber|locky)$', path):
        matched.append("T1486")

    # ── Persistence ──
    if any(x in path or x in cmd for x in ["hkcu\\software\\microsoft\\windows\\currentversion\\run",
                                             "hklm\\software\\microsoft\\windows\\currentversion\\run",
                                             "startup", "launchagents", "launchdaemons"]):
        matched.append("T1547.001")
    if "sc create" in cmd or "sc.exe" in proc:
        matched.append("T1543.003")
    if "launchctl" in cmd and ("load" in cmd or "bootstrap" in cmd):
        matched.append("T1543.004")

    # ── C2 / Network ──
    if port in [4444, 8443, 9001, 1337, 31337, 4445, 5555]:
        matched.append("T1571")  # Non-standard port
        matched.append("T1095")  # Non-application layer protocol
    if port in [80, 443, 8080, 8443] and event.get("ocsf_class_uid") == 4001:
        matched.append("T1071.001")  # Web protocols (beaconing)

    # ── Crypto Mining ──
    if port in [3333, 14444, 45700, 7777, 45560]:
        matched.append("T1496")

    # ── Lateral Movement ──
    if any(x in path or x in cmd for x in ["\\\\", "net use", "net share", "admin$", "ipc$"]):
        matched.append("T1021.002")

    # ── Resource hijacking ──
    if event.get("alert_type") == "MINER_PORT" or event.get("alert_type") == "CRYPTO_MINING":
        matched.append("T1496")

    # Deduplicate preserving order
    seen: set[str] = set()
    result: list[Technique] = []
    for tid in matched:
        if tid not in seen and tid in TECHNIQUES:
            seen.add(tid)
            result.append(TECHNIQUES[tid])
    return result


def primary_technique(event: dict) -> Optional[Technique]:
    """Return the single highest-confidence technique, or None."""
    hits = map_event(event)
    return hits[0] if hits else None


def enrich_event(event: dict) -> dict:
    """Return a copy of event with mitre_* fields added."""
    tech = primary_technique(event)
    event = dict(event)
    event["mitre_technique_id"]   = tech.technique_id if tech else None
    event["mitre_technique_name"] = tech.name          if tech else None
    event["mitre_tactic"]         = tech.tactic         if tech else None
    event["mitre_tactic_id"]      = tech.tactic_id      if tech else None
    event["mitre_url"]            = tech.url             if tech else None
    # Store all matched techniques as a list for OCSF unmappings field
    all_hits = map_event(event)
    event["mitre_techniques"] = [
        {"id": t.technique_id, "name": t.name, "tactic": t.tactic}
        for t in all_hits
    ]
    return event
