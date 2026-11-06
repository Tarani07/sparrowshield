// SparrowShield Endpoint Security Sensor
// Requires entitlement: com.apple.developer.endpoint-security.client
// Build: see build.sh
// Runs as root launchd daemon; outputs one JSON line per event to stdout.

import Foundation
import EndpointSecurity

// ── Threat patterns ──────────────────────────────────────────────────────────

struct ThreatPattern {
    let substring: String
    let score: Float
    let mitreId: String
    let mitreName: String
}

let threatPatterns: [ThreatPattern] = [
    ThreatPattern(substring: "csrutil disable",           score: 0.95, mitreId: "T1562.001", mitreName: "Disable Security Tools"),
    ThreatPattern(substring: "kextload",                  score: 0.85, mitreId: "T1215",     mitreName: "Kernel Module Load"),
    ThreatPattern(substring: "osascript",                 score: 0.70, mitreId: "T1059.002", mitreName: "AppleScript Execution"),
    ThreatPattern(substring: "screencapture",             score: 0.65, mitreId: "T1113",     mitreName: "Screen Capture"),
    ThreatPattern(substring: "security find-generic-password", score: 0.80, mitreId: "T1555.001", mitreName: "Keychain Credential Access"),
    ThreatPattern(substring: "dscl",                     score: 0.55, mitreId: "T1087.001", mitreName: "Account Discovery"),
    ThreatPattern(substring: "launchctl load",            score: 0.60, mitreId: "T1053.004", mitreName: "Launchd Persistence"),
    ThreatPattern(substring: "/tmp/",                    score: 0.45, mitreId: "T1059",     mitreName: "Command Execution from Temp"),
    ThreatPattern(substring: "/var/tmp/",                score: 0.45, mitreId: "T1059",     mitreName: "Command Execution from Temp"),
    ThreatPattern(substring: "curl",                     score: 0.35, mitreId: "T1105",     mitreName: "Ingress Tool Transfer"),
    ThreatPattern(substring: "wget",                     score: 0.35, mitreId: "T1105",     mitreName: "Ingress Tool Transfer"),
    ThreatPattern(substring: "bash -c",                  score: 0.40, mitreId: "T1059.004", mitreName: "Unix Shell Execution"),
    ThreatPattern(substring: "sh -c",                    score: 0.40, mitreId: "T1059.004", mitreName: "Unix Shell Execution"),
    ThreatPattern(substring: "python -c",                score: 0.50, mitreId: "T1059.006", mitreName: "Python Execution"),
    ThreatPattern(substring: "xattr -d",                 score: 0.60, mitreId: "T1553.001", mitreName: "Remove Quarantine Attribute"),
    ThreatPattern(substring: "spctl --master-disable",   score: 0.90, mitreId: "T1553.001", mitreName: "Disable Gatekeeper"),
    ThreatPattern(substring: "pkill",                    score: 0.35, mitreId: "T1489",     mitreName: "Service Stop"),
    ThreatPattern(substring: "nmap",                     score: 0.55, mitreId: "T1046",     mitreName: "Network Service Scanning"),
    ThreatPattern(substring: "ssh-keygen",               score: 0.40, mitreId: "T1098.004", mitreName: "SSH Authorized Keys"),
    ThreatPattern(substring: "crontab",                  score: 0.45, mitreId: "T1053.003", mitreName: "Cron Persistence"),
]

func scorePath(_ path: String, cmdline: String = "") -> (score: Float, mitreId: String?, mitreName: String?) {
    let combined = (path + " " + cmdline).lowercased()
    var totalScore: Float = 0
    var topMitreId: String? = nil
    var topMitreName: String? = nil
    var topScore: Float = 0
    for pattern in threatPatterns {
        if combined.contains(pattern.substring.lowercased()) {
            totalScore += pattern.score
            if pattern.score > topScore {
                topScore = pattern.score
                topMitreId = pattern.mitreId
                topMitreName = pattern.mitreName
            }
        }
    }
    return (min(totalScore, 1.0), topMitreId, topMitreName)
}

// ── Block rules ──────────────────────────────────────────────────────────────

let blockRulesPath = "/etc/sparrowshield/block_rules.json"
var blockRules: Set<String> = []
let blockRulesLock = NSLock()

func loadBlockRules() {
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: blockRulesPath)),
          let rules = try? JSONDecoder().decode([String].self, from: data) else {
        return
    }
    blockRulesLock.lock()
    blockRules = Set(rules)
    blockRulesLock.unlock()
    fputs("[sparrowshield-es] Loaded \(rules.count) block rules\n", stderr)
}

func isBlocked(path: String, signingId: String?) -> Bool {
    blockRulesLock.lock()
    defer { blockRulesLock.unlock() }
    if blockRules.contains(path) { return true }
    if let sid = signingId, blockRules.contains(sid) { return true }
    return false
}

func watchBlockRules() {
    let fd = open(blockRulesPath, O_RDONLY)
    guard fd >= 0 else { return }
    let src = DispatchSource.makeFileSystemObjectSource(
        fileDescriptor: fd,
        eventMask: [.write, .rename, .delete],
        queue: DispatchQueue.global(qos: .utility)
    )
    src.setEventHandler { loadBlockRules() }
    src.setCancelHandler { close(fd) }
    src.resume()
}

// ── JSON output ──────────────────────────────────────────────────────────────

struct ESEventOutput: Encodable {
    var ts: String
    var event_type: String
    var action: String
    var pid: Int32
    var ppid: Int32
    var process_name: String
    var process_path: String
    var signing_id: String
    var team_id: String
    var file_path: String?
    var threat_score: Float?
    var mitre_id: String?
    var mitre_name: String?
}

let jsonEncoder: JSONEncoder = {
    let e = JSONEncoder()
    e.outputFormatting = .withoutEscapingSlashes
    return e
}()

let stdoutLock = NSLock()

func emit(_ event: ESEventOutput) {
    guard let data = try? jsonEncoder.encode(event),
          let line = String(data: data, encoding: .utf8) else { return }
    stdoutLock.lock()
    print(line)
    fflush(stdout)
    stdoutLock.unlock()
}

// ── ES helpers ───────────────────────────────────────────────────────────────

func esString(_ tok: es_string_token_t) -> String {
    guard tok.length > 0, let p = tok.data else { return "" }
    return String(bytes: UnsafeBufferPointer(start: p, count: tok.length), encoding: .utf8) ?? ""
}

func procInfo(_ proc: UnsafePointer<es_process_t>) -> (name: String, path: String, signingId: String, teamId: String, pid: Int32, ppid: Int32) {
    let path = esString(proc.pointee.executable.pointee.path)
    let name = URL(fileURLWithPath: path).lastPathComponent
    let sid  = esString(proc.pointee.signing_id)
    let tid  = esString(proc.pointee.team_id)
    let pid  = audit_token_to_pid(proc.pointee.audit_token)
    let ppid = proc.pointee.ppid
    return (name, path, sid, tid, pid, ppid)
}

func isoNow() -> String {
    ISO8601DateFormatter().string(from: Date())
}

// ── Main ES client ───────────────────────────────────────────────────────────

var esClient: OpaquePointer?

loadBlockRules()
watchBlockRules()

let newClientResult = es_new_client(&esClient) { _, message in
    let now = isoNow()
    let (procName, procPath, sigId, teamId, pid, ppid) = procInfo(message.pointee.process)

    switch message.pointee.event_type {

    // ── AUTH: EXEC ───────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_AUTH_EXEC:
        let target = message.pointee.event.exec.target
        let (_, targetPath, targetSid, _, _, _) = procInfo(target)
        let (score, mId, mName) = scorePath(targetPath)
        let blocked = isBlocked(path: targetPath, signingId: targetSid.isEmpty ? nil : targetSid)
        es_respond_auth_result(esClient!, message, blocked ? ES_AUTH_RESULT_DENY : ES_AUTH_RESULT_ALLOW, false)
        emit(ESEventOutput(ts: now, event_type: "EXEC", action: blocked ? "blocked" : "allowed",
            pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
            signing_id: sigId, team_id: teamId,
            file_path: targetPath.isEmpty ? nil : targetPath,
            threat_score: score > 0 ? score : nil, mitre_id: mId, mitre_name: mName))

    // ── AUTH: CREATE ─────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_AUTH_CREATE:
        var filePath: String = ""
        let dest = message.pointee.event.create.destination
        if dest.type == ES_DESTINATION_TYPE_NEW_PATH {
            let dir  = esString(dest.new_path.dir.pointee.path)
            let name = esString(dest.new_path.filename)
            filePath = dir.hasSuffix("/") ? dir + name : dir + "/" + name
        }
        let (score, mId, mName) = scorePath(filePath)
        let blocked = isBlocked(path: filePath, signingId: nil)
        es_respond_auth_result(esClient!, message, blocked ? ES_AUTH_RESULT_DENY : ES_AUTH_RESULT_ALLOW, false)
        if score > 0.2 || blocked {
            emit(ESEventOutput(ts: now, event_type: "CREATE", action: blocked ? "blocked" : "allowed",
                pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                signing_id: sigId, team_id: teamId,
                file_path: filePath.isEmpty ? nil : filePath,
                threat_score: score > 0 ? score : nil, mitre_id: mId, mitre_name: mName))
        }

    // ── AUTH: OPEN ───────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_AUTH_OPEN:
        let filePath = esString(message.pointee.event.open.file.pointee.path)
        let blocked = isBlocked(path: filePath, signingId: nil)
        es_respond_auth_result(esClient!, message, blocked ? ES_AUTH_RESULT_DENY : ES_AUTH_RESULT_ALLOW, false)
        if blocked {
            emit(ESEventOutput(ts: now, event_type: "OPEN", action: "blocked",
                pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                signing_id: sigId, team_id: teamId,
                file_path: filePath.isEmpty ? nil : filePath,
                threat_score: nil, mitre_id: nil, mitre_name: nil))
        }

    // ── NOTIFY: EXEC ─────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_EXEC:
        let target = message.pointee.event.exec.target
        let (_, targetPath, _, _, _, _) = procInfo(target)
        let (score, mId, mName) = scorePath(targetPath)
        if score > 0.3 {
            emit(ESEventOutput(ts: now, event_type: "EXEC", action: "notify",
                pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                signing_id: sigId, team_id: teamId,
                file_path: targetPath.isEmpty ? nil : targetPath,
                threat_score: score, mitre_id: mId, mitre_name: mName))
        }

    // ── NOTIFY: FORK ─────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_FORK:
        break   // high-volume; skip unless debugging

    // ── NOTIFY: EXIT ─────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_EXIT:
        break   // high-volume; skip unless debugging

    // ── NOTIFY: WRITE ────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_WRITE:
        let filePath = esString(message.pointee.event.write.target.pointee.path)
        let (score, mId, mName) = scorePath(filePath, cmdline: procPath)
        if score > 0.3 {
            emit(ESEventOutput(ts: now, event_type: "WRITE", action: "notify",
                pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                signing_id: sigId, team_id: teamId,
                file_path: filePath.isEmpty ? nil : filePath,
                threat_score: score, mitre_id: mId, mitre_name: mName))
        }

    // ── NOTIFY: RENAME ───────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_RENAME:
        let srcPath = esString(message.pointee.event.rename.source.pointee.path)
        let (score, mId, mName) = scorePath(srcPath, cmdline: procPath)
        if score > 0.3 {
            emit(ESEventOutput(ts: now, event_type: "RENAME", action: "notify",
                pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                signing_id: sigId, team_id: teamId,
                file_path: srcPath.isEmpty ? nil : srcPath,
                threat_score: score, mitre_id: mId, mitre_name: mName))
        }

    // ── NOTIFY: UNLINK ───────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_UNLINK:
        let filePath = esString(message.pointee.event.unlink.target.pointee.path)
        let (score, mId, mName) = scorePath(filePath, cmdline: procPath)
        if score > 0.4 {
            emit(ESEventOutput(ts: now, event_type: "UNLINK", action: "notify",
                pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                signing_id: sigId, team_id: teamId,
                file_path: filePath.isEmpty ? nil : filePath,
                threat_score: score, mitre_id: mId, mitre_name: mName))
        }

    // ── NOTIFY: MMAP ─────────────────────────────────────────────────────────
    case ES_EVENT_TYPE_NOTIFY_MMAP:
        let filePath = esString(message.pointee.event.mmap.source.pointee.path)
        // Only flag executable mmaps from suspicious locations
        let prot = message.pointee.event.mmap.protection
        let isExec = (prot & PROT_EXEC) != 0
        if isExec {
            let (score, mId, mName) = scorePath(filePath, cmdline: procPath)
            if score > 0.3 {
                emit(ESEventOutput(ts: now, event_type: "MMAP_EXEC", action: "notify",
                    pid: pid, ppid: ppid, process_name: procName, process_path: procPath,
                    signing_id: sigId, team_id: teamId,
                    file_path: filePath.isEmpty ? nil : filePath,
                    threat_score: score, mitre_id: mId, mitre_name: mName))
            }
        }

    default:
        break
    }
}

guard newClientResult == ES_NEW_CLIENT_RESULT_SUCCESS else {
    switch newClientResult {
    case ES_NEW_CLIENT_RESULT_ERR_NOT_ENTITLED:
        fputs("[sparrowshield-es] FATAL: Missing entitlement com.apple.developer.endpoint-security.client\n", stderr)
        fputs("[sparrowshield-es] For development: sign the binary with the entitlement and a valid Apple Developer cert,\n", stderr)
        fputs("[sparrowshield-es] or disable SIP (csrutil disable) in Recovery Mode.\n", stderr)
    case ES_NEW_CLIENT_RESULT_ERR_NOT_PERMITTED:
        fputs("[sparrowshield-es] FATAL: Not permitted — grant Full Disk Access in System Settings → Privacy & Security.\n", stderr)
    case ES_NEW_CLIENT_RESULT_ERR_NOT_PRIVILEGED:
        fputs("[sparrowshield-es] FATAL: Must run as root.\n", stderr)
    default:
        fputs("[sparrowshield-es] FATAL: es_new_client failed: \(newClientResult.rawValue)\n", stderr)
    }
    exit(1)
}

// Subscribe to all events
let subscribeEvents: [es_event_type_t] = [
    ES_EVENT_TYPE_AUTH_EXEC,
    ES_EVENT_TYPE_AUTH_CREATE,
    ES_EVENT_TYPE_AUTH_OPEN,
    ES_EVENT_TYPE_NOTIFY_EXEC,
    ES_EVENT_TYPE_NOTIFY_FORK,
    ES_EVENT_TYPE_NOTIFY_EXIT,
    ES_EVENT_TYPE_NOTIFY_WRITE,
    ES_EVENT_TYPE_NOTIFY_RENAME,
    ES_EVENT_TYPE_NOTIFY_UNLINK,
    ES_EVENT_TYPE_NOTIFY_MMAP,
]

let subResult = es_subscribe(esClient!, subscribeEvents, UInt32(subscribeEvents.count))
guard subResult == ES_RETURN_SUCCESS else {
    fputs("[sparrowshield-es] FATAL: es_subscribe failed: \(subResult.rawValue)\n", stderr)
    es_delete_client(esClient!)
    exit(1)
}

fputs("[sparrowshield-es] Started (PID \(getpid())) — subscribed to \(subscribeEvents.count) event types\n", stderr)

// ── Clean shutdown ───────────────────────────────────────────────────────────

func shutdown() {
    fputs("[sparrowshield-es] Shutting down\n", stderr)
    es_unsubscribe_all(esClient!)
    es_delete_client(esClient!)
    exit(0)
}

signal(SIGTERM) { _ in shutdown() }
signal(SIGINT)  { _ in shutdown() }

dispatchMain()
