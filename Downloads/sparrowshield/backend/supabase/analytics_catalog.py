#!/usr/bin/env python3
"""
SparrowShield analytics catalogue (modelled on the Jamf Protect analytics set).

Generates migrations/025_analytics_catalog.sql. Each analytic has a detection `method` the
macOS agent understands (edr_engine.run_analytics):

  cmdline        regex on a running process's command line (optional parent filter)
  parent_child   suspicious child process (name regex) of a parent app (name regex)
  process        process name / executable path checks
  listen         a process listening on an unexpected port
  persistence    new / suspicious items in persistence locations (baselined on first run)
  file_scan      files with a suspicious property in given locations
  log            macOS unified-log predicate + regex over the last few minutes
  config         system configuration checks (Jamf, proxy, DNS)
  malware        known malware family: ClamAV detection names, IOC paths, app names
  es_sensor      needs the Endpoint Security sensor (not yet deployed) — listed, not evaluated
"""
import json, re, uuid
from pathlib import Path

CAT = []
def A(ref, name, category, desc, method, d=None, sev="high", mitre=None, enabled=True):
    slug = re.sub(r"[^a-z0-9]+", "-", f"{name}".lower()).strip("-")
    # keep ids unique when Jamf has several analytics with one name (e.g. three "Leverage Malware")
    base, n = slug, 2
    while any(c["id"] == slug for c in CAT):
        slug = f"{base}-{n}"; n += 1
    CAT.append(dict(id=slug, source_ref=ref, name=name, category=category, description=desc, method=method,
                    definition=d or {}, severity=sev, mitre=mitre, enabled=enabled))

SHELL = r"(^|/)(ba|z|k|c|tc|da)?sh$"

# ── Living Off the Land ───────────────────────────────────────────────────────
L = "Living Off the Land"
rs = lambda ref, name, pats: A(ref, name, L, "Reverse shell creation attempted", "cmdline", {"patterns": pats}, "critical", "T1059.004")
rs("dcb69719-5ae1-46f6-972a-da1799daa00c", "Reverse Shell Perl (Deprecated)", [r"perl .*-e.*(socket|IO::Socket).*(exec|/bin/(ba|z)?sh)"])
rs("3fa48b4a-7b5e-11ed-8505-dee89a7045ff", "Reverse Shell Generic (Deprecated)", [r"/dev/(tcp|udp)/[0-9a-z.\-]+/[0-9]+", r"(ba|z)?sh -i\s*[<>&]+"])
rs("bcaa9eff-7de1-4809-9255-06a9919e2f8e", "Reverse Shell Python (Deprecated)", [r"python[0-9.]* .*-c.*socket.*(subprocess|pty|os\.dup2)"])
rs("bd9708da-a655-4fc8-bc3c-5641254d6f04", "Reverse Shell ZSH (Deprecated)", [r"zsh .*(zmodload zsh/net/tcp|ztcp )"])
rs("55729e64-afdb-48a9-a1c7-e3d81c2bd5e8", "Reverse Shell Ruby (Deprecated)", [r"ruby .*-rsocket", r"ruby .*TCPSocket\.(new|open).*(exec|spawn|/bin/sh)"])
rs("e294b48d-e24d-47b6-b957-55dc6ad2c1b3", "Reverse Shell PHP (Deprecated)", [r"php .*-r.*fsockopen"])
rs("9bfc40a5-1063-4fde-a3ab-d734f03f26f2", "Reverse Shell Netcat", [r"(^|/)(nc|ncat|netcat) .*-[a-z]*[ec] +(/bin/)?(ba|z)?sh", r"mkfifo .*\|\s*(nc|ncat|netcat) "])
A("ec930ae1-1796-11ea-b2ba-acde48001122", "Cat Piped to NC", L, "Reverse shell creation attempted", "cmdline",
  {"patterns": [r"cat [^|]*\|\s*(nc|ncat|netcat) [0-9a-z.\-]+ [0-9]+"]}, "critical", "T1059.004")
A("1fafca0f-2dfd-478d-a6c1-2ee143e6c169", "Script Run With Resource Fork", L, "Resource fork script execution", "cmdline",
  {"patterns": [r"/\.\.namedfork/rsrc"]}, "high", "T1564.009")
A("d0caf4fc-03bf-450d-bca2-7c7c0a074e34", "SSH Service on Abnormal Port", L, "Service running on odd port", "listen",
  {"process": r"^sshd$", "allowed_ports": [22]}, "high", "T1021.004")
A("c20e347d-10b0-4047-96ff-88a060a1668e", "Suspicious Curl Command", L, "Remote script passed directly to memory", "cmdline",
  {"patterns": [r"curl [^|;]*https?://[^|;]*\|\s*(sudo +)?(ba|z)?sh", r"curl [^|;]*\|\s*(python[0-9.]*|perl|ruby|osascript)( |$)",
                r"(ba|z)?sh -c \"?\$\(curl "]}, "high", "T1105")
A("e74135b3-2b97-11ec-bbc5-1e00d23a1099", "Suspicious Mdfind Command", L, "Suspicious spotlight search", "cmdline",
  {"patterns": [r"mdfind .*(password|passwd|secret|keychain|\.ssh|id_rsa|wallet|kMDItemTextContent)"]}, "medium", "T1083")
A("a0ae8850-902a-4d46-b06b-27973939136f", "Suspicious JXA", L, "Suspicious JXA Command Executed", "cmdline",
  {"patterns": [r"osascript .*-l +JavaScript.*(ObjC\.import|doShellScript|\$\.NSTask|NSFileManager|eval\()"]}, "high", "T1059.007")

# ── Privilege Escalation ──────────────────────────────────────────────────────
P = "Privilege Escalation"
A("3c8a88ef-277a-4238-a695-ebaa6eee0921", "Setuid Shell", P, "Shell created with elevated privileges", "file_scan",
  {"paths": ["/tmp", "/private/tmp", "/private/var/tmp", "/Users/Shared", "/Users/*/Library", "/Users/*/Downloads"], "check": "setuid_shell"}, "critical", "T1548.001")
A("36018fbd-b16b-11ea-9f04-acde48001122", "SetUID Bit on Shell", P, "The setUID bit has been set", "cmdline",
  {"patterns": [r"chmod +([ugoa]*\+s|[0-7]?[4-7][0-7]{3}) .*(ba|z|k|c|tc|da)?sh(\s|$)"]}, "critical", "T1548.001")
A("9dbb7667-39ce-4544-9c23-765f8194c3ef", "Sudo Hooking", P, "Sudo executed by process impersonating sudo", "process",
  {"name": r"^sudo$", "exe_not": r"^/usr/bin/sudo$"}, "critical", "T1548.003")
A("12630dc0-6664-11eb-a951-acde48001122", "Sudoedit Exploitation", P, "System Vulnerability Abused", "cmdline",
  {"patterns": [r"sudoedit +-s +.*\\\s*$", r"sudoedit +-s +['\"]?\\"]}, "critical", "T1068")
A("37d89500-7544-11ea-9207-acde48001122", "Insecure Elevated Execution", P, "Process used insecure method to elevate privileges", "process",
  {"name": r"^security_authtrampoline$"}, "high", "T1548.004")

# ── Known Malicious File ─────────────────────────────────────────────────────
K = "Known Malicious File"
mal = lambda ref, name, fam, kw, paths=None, apps=None, desc=None, sev="critical", mitre="T1204.002": A(
    ref, name, K, desc or f"Known malware IOC for {fam}", "malware", {"keywords": kw, "paths": paths or [], "apps": apps or []}, sev, mitre)
mal("7aed30dd-c78a-4742-a682-bd52e63994d4", "Mughthesec Malware", "Mughthesec", ["mughthesec"], ["/Applications/Safe Finder.app"], ["Safe Finder"], sev="high")
mal("58a61ec9-d840-4242-8acd-193679a87f87", "Conduit Malware", "Conduit", ["conduit"], ["/Library/Application Support/Conduit"], sev="high")
mal("6108bb47-fcff-4f9d-879e-1dab6d0d1045", "Tibet D Alert", "Tibet", ["tibet"], ["/Library/Audio/Plug-Ins/AudioServer"])
mal("3891978c-6ec5-4db9-9285-d069ebaaa90f", "Leverage Malware", "Leverage", ["leverage"], ["/Users/Shared/UserEvent.app"])
mal("67db75b5-5fbe-4537-991c-bd7ad0dc4745", "Eleanor Malware", "Eleanor", ["eleanor"], ["/Library/.dropbox", "~/Library/LaunchAgents/com.getdropbox.dropbox.integritycheck.plist"])
mal("a5da91c1-bbea-401d-af28-854d58ea78ea", "Buca Malware", "Buca", ["buca"])
mal("c15f291e-8009-4004-87b1-536734234b12", "Elite Keylogger", "EliteKeylogger", ["elitekeylogger", "elite keylogger"], ["/Library/LaunchAgents/com.ekeylogger.plist"], ["Elite Keylogger"], mitre="T1056.001")
mal("fd86129b-7d05-4e41-b0c0-fb9e6a8a60ab", "Morcut Malware", "Morcut", ["morcut", "crisis"])
mal("19c02a6b-1b50-46d9-915e-1ca8c3c9b67c", "Empyre Malware", "EmPyre", ["empyre"])
mal("fafc464f-43bb-4fd7-8f7c-c35f8c4c702a", "FruitFly Malware", "FruitFly", ["fruitfly", "quimitchin"], ["~/.client", "~/Library/LaunchAgents/com.client.client.plist"])
mal("d2ac73e3-b472-43fd-9d4a-566a36638636", "Hacking Team Malware", "HackingTeamRat", ["hackingteam", "crisis", "morcut"])
mal("7f6459d0-0887-4b1e-9fde-a2bd75ce222f", "Icefog Malware", "Icefog", ["icefog", "macontrol"])
mal("31416d5a-960c-4bb2-b6fb-46387d1aab92", "Imuler Malware", "Imuler", ["imuler", "revir"], ["/tmp/.mdworker"])
mal("a9f729d6-8eea-4c70-b6d3-a28dff462b1b", "Inqtana Malware", "Inqtana", ["inqtana"])
mal("3af00e75-38e6-4143-a481-2954ed173648", "Keranger Malware", "Keranger", ["keranger"], ["~/Library/kernel_service", "~/Library/.kernel_pid", "~/Library/.kernel_time"], mitre="T1486")
mal("781f8cee-3e5d-429b-bff5-36734f5be881", "Leverage Malware", "Leverage", ["leverage"])
mal("02e15df8-1656-41ad-8f54-9def66d88ce7", "Leverage Malware", "Leverage", ["leverage"])
mal("f03c445f-c86e-4e69-ae07-384960ad737c", "MacKontrol Malware", "MacKontrol", ["mackontrol", "macontrol"])
mal("8bc11002-0ec4-4b54-90ab-a175cdcfbc79", "Coldroot Malware", "ColdRoot", ["coldroot"], ["/private/var/tmp/com.apple.audio.driver.app", "/Library/LaunchDaemons/com.apple.audio.driver.plist"])
mal("5a423050-0ecd-49a6-8dd2-bae52aab7004", "Dok Malware", "Dok", ["dok"], ["/Users/Shared/AppStore.app"])
mal("7cf768be-1239-4ee6-a786-45dc07561bad", "Komplex Malware", "Komplex", ["komplex"], ["/Users/Shared/.local/kextd", "~/Library/LaunchAgents/com.apple.updates.plist"])
mal("d2b2b930-38ad-4e8f-8871-6a910b44ff95", "OSXProton Malware", "Proton", ["proton"], ["~/Library/LaunchAgents/com.apple.xpcd.plist", "~/Library/.cachedata"])
mal("916d69ae-a7bd-4f29-bf7a-6fefe7ea8c10", "Proton Malware", "Proton", ["proton"], ["~/Library/LaunchAgents/com.Eltima.UpdaterAgent.plist"])
mal("b5e481fd-556d-4034-8828-b55cf3a3eb6c", "Proton Malware", "Proton", ["proton"], ["~/Library/LaunchAgents/com.apple.xpcd.plist"])
mal("33860bb0-d227-4b34-8c16-0b31c8141251", "Snake Malware", "Snake", ["snake", "turla"])
mal("ada5fe56-9751-4d18-87db-13ea6b1aa051", "OceanLotus Malware", "OceanLotus", ["oceanlotus", "apt32"], ["~/Library/LaunchAgents/com.apple.spell.agent.plist"])
mal("cc21ac53-d3a7-481e-994f-cd254588d196", "Olyx Malware", "Olyx", ["olyx"], ["~/Library/Application Support/google/startp"])
mal("eb196b01-f40e-4609-ab2c-600e19251ccc", "Pronto Malware", "Pronto", ["pronto"])
mal("2cd98120-be15-4844-b01a-466f41a3b2f6", "PubSab Malware", "PubSab", ["pubsab"], ["/Library/LaunchAgents/com.apple.FolderActionsxl.plist"])
mal("32c144cf-a5c3-4040-87f5-e8ce78ff9eeb", "Quimitchin Malware", "Quimitchin", ["quimitchin", "fruitfly"], ["~/.client"])
mal("9b6b6525-5389-4d06-a81f-5422a1e21590", "OSXDummy Malware", "OSXDummy", ["dummy"], ["/var/root/script.sh", "/Library/LaunchDaemons/com.startup.plist"])
mal("52bcb0f3-a481-48a1-86f7-717064e4ce16", "Aobo Keylogger", "AoboKeylogger", ["aobo"], ["/Library/LaunchAgents/com.ab.kl.plist"], ["Aobo"], mitre="T1056.001")
mal("e0c0e800-58d1-11ea-83f0-acde48001122", "Shlayer Malware", "Shlayer", ["shlayer", "bundlore"], desc="Known malware tool syntax for Shlayer")
mal("f39ff9a1-ee32-48df-b561-ba5faf88ba7a", "iWorm Malware", "iWorm", ["iworm"], ["/Library/Application Support/JavaW", "/Library/LaunchDaemons/com.JavaW.plist"])
mal("1271c12f-8b30-441c-9990-adc0b4e63213", "Spigot Malware", "Spigot", ["spigot"], sev="high")
mal("da360eb3-217f-44f2-b6d0-296116ac0f0a", "Blazing Keylogger", "BlazingKeylogger", ["blazing"], mitre="T1056.001")
mal("d4424688-3ec0-48c6-bfc0-726db6cb4458", "DevilRobber Malware", "DevilRobber", ["devilrobber"])
mal("72d19865-b596-4f24-9a7a-b301e526a4ec", "Dockster Malware", "Dockster", ["dockster"], ["~/Library/LaunchAgents/mac.Dockset.deman.plist", "/Users/Shared/.mocha"])
mal("19f2279c-2963-40e4-8e5e-15d8b8111c0f", "XSLCmd Malware", "XSLCmd", ["xslcmd"], ["~/Library/LaunchAgents/com.apple.service.clipboardd.plist"])
mal("0e086ee9-34d8-406d-a1e0-ebc73cc41f71", "Whitesmoke Malware", "Whitesmoke", ["whitesmoke"], sev="high")
mal("8e1c6de5-3c43-49f2-b226-ca2024a7a672", "Wirelurker Malware", "Wirelurker", ["wirelurker"], ["/Library/LaunchDaemons/com.apple.machook_damon.plist", "/usr/local/machook"])
mal("06a7fd3e-d4c2-4d82-a502-f5a064c65b7b", "Tinyshell Malware", "TinyShell", ["tinyshell", "tsh"])
mal("07ad6c9d-0115-4c4b-b37f-75044a215de9", "Vsearch Malware", "Vsearch", ["vsearch"], ["/Library/Application Support/VSearch"], sev="high")
mal("86dcebb5-d1db-4123-af66-ad70bed29e85", "Mokes Malware", "Mokes", ["mokes"], ["~/Library/App Store/storeuserd", "~/Library/com.apple.spotlight/SpotlightHelper"])
mal("c0933848-1ec7-4948-9a12-a57aa40b4c8b", "Careto Malware", "Careto", ["careto"])
mal("6ace2317-69d0-4843-8b31-33fd4712ce7c", "CallMe Malware", "CallMe", ["callme"], ["/Library/Application Support/.realPath"])
mal("ca936ac2-cbfe-4522-b9eb-980443695697", "OSXDummy Malware", "OSXDummy", ["dummy"], ["/var/root/script.sh"])
mal("3be4119b-766f-4cda-b0b0-8fe41e14e4d1", "EvilOSX Malware", "EvilOSX", ["evilosx"], desc="Known malware tool syntax for EvilOSX")
mal("c1088a3f-bc4c-41ee-b132-31d999ac9c6c", "HiddenLotus Malware", "HiddenLotus", ["hiddenlotus", "oceanlotus"])
mal("79072189-820a-4a95-b088-22ecbe36ae26", "Keydnap Malware", "Keydnap", ["keydnap"], ["~/Library/Application Support/com.apple.iCloud.sync.daemon", "~/Library/LaunchAgents/com.apple.iCloud.sync.daemon.plist"])
mal("4f6d0ff3-9617-4840-bd00-db6e2d183292", "Hacking Team Malware", "HackingTeam", ["hackingteam", "crisis"])
mal("94087d59-9aa9-42ae-991c-da4dac10d84d", "Hacking Team Malware", "HackTeamRAT1", ["hackingteam", "crisis"])
mal("e59e0cdc-eea2-11e9-ba08-a683e73a7372", "Applejeus Malware", "AppleJeus", ["applejeus", "lazarus"], ["/Library/LaunchDaemons/com.celastradepro.plist", "/Library/LaunchDaemons/org.jmttrading.plist"])
mal("593b986f-d143-44ef-98ce-263b9b1b5d6a", "Keranger Malware", "Keranger", ["keranger"], mitre="T1486")
mal("efb3585b-e8bd-4abd-8153-524234abdac9", "Dok Malware", "Dok", ["dok"])
mal("40767b6c-679a-4c71-a917-c5a53d45d789", "ColdRoot Malware", "ColdRoot", ["coldroot"])
mal("415830a2-7052-42cc-92dd-28f966470d37", "SniperSpy Malware", "SniperSpy", ["sniperspy"])
mal("6d95bd33-d23b-4abd-8ec4-45812c090e59", "iWork Malware", "iWorkServ", ["iworkserv", "iwork"], ["/private/tmp/.iWorkServices", "/System/Library/StartupItems/iWorkServices"])
mal("dc226626-0b1a-4edd-8663-c4a254e6cc46", "MacKeeper PUP", "MacKeeper", ["mackeeper"], ["/Applications/MacKeeper.app"], ["MacKeeper"], sev="medium")
mal("95cb7718-35e1-47d0-a108-ecfa296a4fb8", "Macsearch Adware", "MacSearch", ["macsearch"], [], ["MacSearch"], sev="medium")
mal("fd511a88-6874-4ce9-aa95-aa4349cf39c3", "SearchInstUpdater Adware", "SearchInstUpdater", ["searchinstupdater"], [], [], "Known malware for SearchInstUpdater", "medium")
A("bb7a5587-5d6b-11ea-aa26-acde48001122", "Tmp File With Base64 Argument", K, "Common attacker syntax out of /tmp", "cmdline",
  {"patterns": [r"^(/private)?/tmp/\S+ .*[A-Za-z0-9+/]{60,}={0,2}"]}, "high", "T1027")
mal("44d96aef-6417-4f53-b835-26164267c273", "Genieo Adware", "Genieo", ["genieo"], ["/Applications/Genieo.app"], ["Genieo"], sev="medium")
mal("423b41a2-5668-43fd-80de-4db7c2b98e49", "PremierOpinion Adware", "PremierOpinion", ["premieropinion", "opinionspy"], [], ["PremierOpinion"], sev="medium")
mal("04d74694-d9eb-4b82-b583-276567ac914c", "Bundlore Adware", "Bundlore", ["bundlore", "shlayer"], sev="medium")
mal("649d8a8b-5a36-4c5c-b74c-f9709b7210b6", "Codecm Adware", "Codecm", ["codecm"], sev="medium")

# ── Common Attacker Technique ────────────────────────────────────────────────
C = "Common Attacker Technique"
A("17e92a8c-e075-11e9-8a98-a683e73a7372", "Improper use of Netcat", C, "Reverse shell attempt", "cmdline",
  {"patterns": [r"(^|/)(nc|ncat|netcat) .*-[a-z]*e ", r"(^|/)(nc|ncat|netcat) +-[a-z]*l[a-z]* .*-[a-z]*e "]}, "critical", "T1059")
A("51cfe863-90a1-4673-a4a2-c104a71c86ea", "Python Creates Pty", C, "Python created a PTY device file", "cmdline",
  {"patterns": [r"python[0-9.]* .*pty\.spawn"]}, "high", "T1059.006")
A("d4c92545-1c4d-11ea-8497-acde48001122", "Earthworm Malware", C, "Known malware tool syntax for EarthWorm", "cmdline",
  {"patterns": [r" -s +(ssocksd|rcsocks|rssocks|lcx_slave|lcx_listen|lcx_tran)\b"]}, "critical", "T1090")
A("dc12ce93-7ba5-40bc-93db-a3fa42d16f7e", "Chrome Extension Loaded", C, "Chrome extension sideloaded", "cmdline",
  {"patterns": [r"Google Chrome.* --load-extension="]}, "high", "T1176")
A("4749f023-03ee-48b8-a30f-2b06506b0f38", "Suspicious Office File Creation", C, "Suspicious file created under productivity software", "file_scan",
  {"paths": ["/Users/*/Library/Containers/com.microsoft.*/Data"], "check": "recent_script", "max_age_minutes": 70}, "high", "T1137")
A("2c4fab52-59f2-41a5-8bff-d045875e568a", "Script Disguised As Application", C, "An application is using a script as its main binary", "file_scan",
  {"paths": ["/Applications", "/Users/*/Applications", "/Users/*/Downloads"], "check": "script_app"}, "high", "T1036")
A("da1ccd4f-0f1c-11eb-b65d-a683e73a7372", "Suspicious File Download", C, "Suspicious file downloaded", "file_scan",
  {"paths": ["/Users/*/Downloads"], "check": "suspicious_download", "max_age_minutes": 70}, "medium", "T1105")
A("4a2f3dd0-8b0d-4620-9f60-90123630b20f", "Hidden Script Run From Volumes", C, "Hidden script execution", "cmdline",
  {"patterns": [r"^/Volumes/[^ ]*/\.[^/ ]+", r"(ba|z)?sh +/Volumes/[^ ]*/\."]}, "high", "T1564.001")
A("98ccee41-cada-45be-bcdf-5641ca43bba8", "Executable ran out of uncommon directory", C, "Execution in Shared Directory", "process",
  {"exe": r"^(/Users/Shared|/private/var/tmp|/Library/Caches)/"}, "medium", "T1036.005", enabled=False)
A("1e4c2e9e-42ca-11ea-a3ed-acde48001122", "Flash Download Not Signed By Adobe", C, "Common file name with signature mismatch", "file_scan",
  {"paths": ["/Users/*/Downloads"], "check": "name_match", "name": r"(?i)(adobe)?.*flash.?player.*\.(dmg|pkg|app|zip)$"}, "high", "T1204.002")
A("6a37faae-e236-11ea-abaa-a683e73a7372", "Suspicious Office Activity", C, "Suspicious child process under productivity software", "parent_child",
  {"parents": r"^Microsoft (Word|Excel|PowerPoint|Outlook)$", "children": r"^(ba|z|k|c|tc|da)?sh$|^python[0-9.]*$|^osascript$|^curl$|^perl$|^ruby$"}, "critical", "T1204.002")
A("86633362-0c69-40f9-9a3a-1b583361c46f", "Little Snitch Check", C, "Reconnaissance check for Little Snitch firewall", "cmdline",
  {"patterns": [r"(ls|pgrep|ps|find|test) .*(Little Snitch|littlesnitch|at\.obdev)", r"pgrep +-i? *littlesnitch"]}, "medium", "T1518.001")
A("d825c1fc-15c3-4ccb-9877-6f47001bfa16", "SSH Service Enabled Via Cmd", C, "SSH Enabled", "cmdline",
  {"patterns": [r"systemsetup +-setremotelogin +on", r"launchctl +(load|enable|bootstrap) .*ssh"]}, "high", "T1021.004")

# ── System Tampering ─────────────────────────────────────────────────────────
T = "System Tampering"
A("95bea8b2-4b5a-4c3a-bc3d-7d4207420e42", "Insecure Jamf Pro JSS_URL", T, "Insecure Jamf Pro jss_url", "config", {"check": "jamf_url_insecure"}, "high", "T1562.001")
A("c32ef857-f624-11eb-b545-a683e74edf20", "Suspicious Jamf Pro URL", T, "Known malicious Jamf Pro jss_url", "config", {"check": "jamf_url_changed"}, "critical", "T1562.001")
A("696cdbc7-f3b0-11eb-bc1b-a683e74edf20", "Jamf Pro Configuration Modified", T, "Process modified Jamf Pro URL", "cmdline",
  {"patterns": [r"defaults +write +.*com\.jamfsoftware\.jamf.* jss_url", r"jamf +createConf .*-url"]}, "critical", "T1562.001")
A("f820b1b1-45c0-4809-a174-de9da9d89571", "TCC Database File Manually Created", T, "Unconventional TCC Database Creation", "cmdline",
  {"patterns": [r"sqlite3 .*TCC\.db", r"(cp|mv|ditto) .*TCC\.db"]}, "critical", "T1548")
A("23397481-4c5a-4b18-a62d-ed8110a421af", "Jamf Pro Binary Modified", T, "Jamf Pro binary modified or removed", "config", {"check": "jamf_binary_changed"}, "critical", "T1562.001")
A("6feae9cf-ce6d-4577-b655-555dd8a64f20", "DNS Modification", T, "Process modified DNS settings", "cmdline",
  {"patterns": [r"networksetup +-setdnsservers ", r"scutil .*(add|set) .*ServerAddresses"]}, "high", "T1565")
A("db15555c-f22a-4403-84fe-6f6fcaa2bf69", "Proxy Set To Localhost", T, "Proxy Set To Localhost", "config", {"check": "proxy_localhost"}, "high", "T1090.001")
A("7fb3fb82-e014-11e9-87be-a683e73a7372", "Web Proxy Set To Localhost", T, "Web proxy set to localhost", "cmdline",
  {"patterns": [r"networksetup +-set(web|secureweb|socksfirewall)proxy +.*(127\.0\.0\.1|localhost)"]}, "high", "T1090.001")

# ── Exploitation ─────────────────────────────────────────────────────────────
E = "Exploitation"
A("e8886aa8-e0c2-11ea-b514-a683e73a7372", "Safari Cookie Accessed With SCP", E, "Safari cookie database was taken", "cmdline",
  {"patterns": [r"scp .*Cookies\.binarycookies", r"scp .*Library/Cookies/"]}, "critical", "T1539")
A("f54393cc-0a39-11ea-8dd7-a683e73a7372", "Suspicious Safari Activity", E, "Web browser created abnormal child process", "parent_child",
  {"parents": r"^(Safari|com\.apple\.WebKit\.)", "children": r"^(ba|z|k|c|tc|da)?sh$|^python[0-9.]*$|^osascript$|^curl$"}, "critical", "T1189")
A("ac77aeb5-e0cc-11ea-b637-a683e73a7372", "Safari Session Added To Keychain", E, "Safari session manually added to keychain", "cmdline",
  {"patterns": [r"security +add-(generic|internet)-password .*(Safari|WebKit|cookie)"]}, "high", "T1555.001")
A("fb6dcfa1-c687-4d85-be56-3d67bc853895", "Nested App Signature Mismatch", E, "Nested application signature mismatch", "es_sensor", {}, "high", "T1553.002")
A("55f06cd2-6ed4-4bce-96c7-039201701d38", "Suspicious iNetLoc Written", E, "Suspicious location file written", "file_scan",
  {"paths": ["/Users/*/Downloads", "/Users/*/Desktop"], "check": "name_match", "name": r"(?i)\.(inetloc|fileloc|afploc)$", "max_age_minutes": 70}, "high", "T1204.001")

# ── Credential Harvesting ────────────────────────────────────────────────────
H = "Credential Harvesting"
A("8d4bb99b-2a13-4994-94e3-1edfb422cff3", "Kcpassword Reveal", H, "User credentials were decoded", "cmdline",
  {"patterns": [r"/etc/kcpassword"]}, "critical", "T1552.001")
A("033d2706-50e2-11ef-af4b-563018aca4db", "AppleScript prompts for credentials", H, "AppleScript dialog for collection of secrets", "cmdline",
  {"patterns": [r"osascript .*display dialog .*(password|passcode).*hidden answer"]}, "high", "T1056.002", enabled=False)
A("bb5fefec-e623-4157-ae70-b51c28a211e1", "Hashdump", H, "Credential hashes were dumped", "cmdline",
  {"patterns": [r"dscl .*-read .*ShadowHashData", r"defaults +read +/var/db/dslocal/nodes/Default/users/", r"plutil .*/var/db/dslocal/nodes/Default/users/"]}, "critical", "T1003")

# ── System Visibility ────────────────────────────────────────────────────────
V = "System Visibility"
A("4ea9fb57-2062-11eb-a5a7-a683e73a7372", "SSH Login As Root", V, "Root login over SSH", "log",
  {"predicate": 'process == "sshd"', "regex": r"Accepted \S+ for root from"}, "critical", "T1078.003")
A("c94af094-5ea1-11ec-be1c-0660d8e6ab1f", "Suspicious Java Activity", V, "Java executed curl or an interactive shell", "parent_child",
  {"parents": r"^java$", "children": r"^(ba|z|k|c|tc|da)?sh$|^curl$"}, "high", "T1059")
A("cb4d90c6-0cd2-41c5-8d77-67bd84457ca9", "Screenshot", V, "Screenshot taken", "process", {"name": r"^screencapture$"}, "low", "T1113")
A("25a295ca-f4b3-4f78-8faa-80e9182645f1", "Custom URL Handler Creation", V, "Application that uses custom url handler created", "file_scan",
  {"paths": ["/Users/*/Downloads", "/Users/*/Applications", "/Applications"], "check": "url_handler_app", "max_age_minutes": 70}, "low", "T1204")
A("6f7b24ca-1a10-11eb-b2f4-a683e73a7372", "SSH Login", V, "Successful SSH login occurred", "log",
  {"predicate": 'process == "sshd"', "regex": r"Accepted \S+ for \S+ from"}, "medium", "T1021.004")
A("de0861e1-0f40-4a9c-a63a-572b6cd24aa8", "Safari Wrote Custom Url Handler", V, "Safari created an app with a custom url handler", "file_scan",
  {"paths": ["/Users/*/Downloads"], "check": "url_handler_app", "max_age_minutes": 70}, "medium", "T1204")
A("3b2a6142-0a31-11ea-b7bf-a683e73a7372", "Suspicious Chrome Activity", V, "Web browser created abnormal child process", "parent_child",
  {"parents": r"^Google Chrome( Helper.*)?$", "children": r"^(ba|z|k|c|tc|da)?sh$|^python[0-9.]*$|^osascript$|^curl$"}, "high", "T1189")
A("2d5c83c0-c914-40bb-b606-3e16b04443af", "Synthetic Click", V, "Process sent synthetic click to system", "es_sensor", {}, "medium", "T1056")
A("b4fe77b3-f8d3-483d-ba29-ea2e1a5c44ea", "USB Inserted", V, "USB device inserted", "builtin", {"source": "usb_inserted security event"}, "low", "T1091")
A("5767b268-d804-4e14-b100-e6aa85880e67", "USB Write", V, "Content was written to a USB device", "es_sensor", {}, "medium", "T1052.001")
A("db094865-99c2-416c-9f06-e7740d9e8a20", "User Elevated Action", V, "Application used deprecated elevation API", "process",
  {"name": r"^security_authtrampoline$"}, "medium", "T1548.004")
A("f6927ccc-296a-435c-b294-a3ca24319ab1", "Kernel Extension", V, "Kernel Extension created for persistence", "persistence",
  {"paths": ["/Library/Extensions"], "glob": "*.kext", "check": "new"}, "high", "T1547.006")
A("bf7940a0-922c-4597-8bb0-126f8f83c298", "Self Delete", V, "A process deleted its own binary", "process", {"check": "exe_deleted"}, "high", "T1070.004")

# ── Evasion ──────────────────────────────────────────────────────────────────
EV = "Evasion"
LA = ["/Library/LaunchAgents", "/Library/LaunchDaemons", "/Users/*/Library/LaunchAgents"]
A("b7b0787d-447a-4976-8105-8a57e7b93510", "Plist Disguised As Google", EV, "Highly suspicious persistence created", "persistence",
  {"paths": LA, "glob": "com.google.*.plist", "check": "disguised", "expected": [r"^/Applications/Google ", r"/Library/Google/", r"/Library/Application Support/Google/"]}, "critical", "T1036.005")
A("d1309e45-0a4b-11ea-babd-a683e73a7372", "Plist Points To Hidden Binary", EV, "Highly suspicious persistence created", "persistence",
  {"paths": LA, "glob": "*.plist", "check": "hidden_target"}, "critical", "T1564.001")
A("d4515080-dfea-48db-a5bc-529d6f897732", "Timestomped Daemon", EV, "Anti-forensics applied to LaunchDaemon", "cmdline",
  {"patterns": [r"touch +(-[a-z]+ +)*-[tdr] .*/Library/Launch(Daemons|Agents)/", r"SetFile +-[dm] .*/Library/Launch(Daemons|Agents)/"]}, "high", "T1070.006")
A("e574c045-2386-490d-9412-c2e1b2b7ab2b", "DSStore Dir Create", EV, "A suspicious name was used for a directory", "file_scan",
  {"paths": ["/Users/*", "/Users/*/Library", "/Users/Shared", "/private/tmp", "/Library"], "check": "dsstore_dir"}, "high", "T1564.001")
A("d7548050-61a1-4d18-9acf-31b8eb76462e", "Disguised Executable", EV, "Binary executed with contradictory file extension", "process",
  {"exe": r"(?i)\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|rtf|mp[34]|mov|zip)$"}, "critical", "T1036.008")
A("109e0157-e06d-11e9-ad6b-a683e73a7372", "Hidden Launch Plist Created", EV, "Highly suspicious persistence created", "persistence",
  {"paths": LA, "glob": ".*.plist", "check": "new"}, "critical", "T1564.001")
A("9da55732-c4a1-4bd3-a3c2-a7a26e6359fd", "Non Quarantined App Download", EV, "App Download Missing Quarantine Attribute", "file_scan",
  {"paths": ["/Users/*/Downloads"], "check": "no_quarantine_app", "max_age_minutes": 70}, "high", "T1553.001")
A("fbbc5c2f-167d-4336-a364-1e9ef4d5d91e", "Plist Disguised As Apple", EV, "Highly suspicious persistence created", "persistence",
  {"paths": LA, "glob": "com.apple.*.plist", "check": "disguised", "expected": [r"^/System/", r"^/usr/(libexec|bin|sbin)/", r"^/Library/Apple/"]}, "critical", "T1036.005")
A("d13252ba-1aa6-4dfc-a7a9-436f1de96245", "Process Disguised As Apple", EV, "Process created with common Apple service name", "process",
  {"name": r"^com\.apple\.", "exe_not": r"^(/System/|/usr/|/Library/Apple/|/Applications/Xcode|/Library/Developer/|/Applications/[^/]+\.app/Contents/)"}, "critical", "T1036.005")
A("139b6cf1-7ee3-4575-a852-5de303a50756", "File Extension Begins Or Ends With Space", EV, "Suspicious file extension identified", "process",
  {"exe": r"(\.\s+\S+$|\S+\.\S+\s+$)"}, "high", "T1036.006")
A("f62c94a0-9469-4a78-bf23-06c40e755938", "Command History Deleted", EV, "Command history was directly deleted", "cmdline",
  {"patterns": [r"rm +(-[a-z]+ +)*\S*\.(bash|zsh|sh)_history", r"history +-c", r"(cat|echo) +/dev/null +>+ *\S*_history", r"unset +HISTFILE"]}, "high", "T1070.003")

# ── Persistence ──────────────────────────────────────────────────────────────
PE = "Persistence"
A("0eb4ca4e-e883-49d5-8160-edf17527152e", "Periodic Script", PE, "A script was added for execution by periodic", "persistence",
  {"paths": ["/etc/periodic/daily", "/etc/periodic/weekly", "/etc/periodic/monthly", "/usr/local/etc/periodic/daily"], "glob": "*", "check": "new"}, "high", "T1053")
A("24fcb4dc-5720-422d-9801-42b1e7b7b291", "Dock Tile Added", PE, "New Dock Tile registered", "persistence",
  {"paths": ["/Applications/*.app/Contents/PlugIns"], "glob": "*.docktileplugin", "check": "new"}, "low", "T1547", enabled=False)
A("f4aff500-1011-497e-bcef-916710800838", "Event Monitor", PE, "Event Monitor created for persistence", "persistence",
  {"paths": ["/etc/emond.d/rules", "/private/var/db/emondClients"], "glob": "*", "check": "new"}, "critical", "T1546.014")
A("3d302d74-e3d0-44fb-8206-13cff0575617", "Login Hook", PE, "Login Hook created for persistence", "config", {"check": "login_hook"}, "critical", "T1037.002")
A("16b5a787-682b-49c1-a4ce-c53043cb204b", "Login Item", PE, "LoginItem created for persistence", "persistence",
  {"paths": ["/private/var/db/com.apple.backgroundtaskmanagement"], "glob": "*.btm", "check": "changed"}, "medium", "T1547.015")
A("e55d9ad3-6e40-44aa-acc8-d77078a648aa", "Login Item Deprecated", PE, "LoginItem created for persistence", "persistence",
  {"paths": ["/Users/*/Library/Application Support/com.apple.backgroundtaskmanagementagent"], "glob": "backgrounditems.btm", "check": "changed"}, "medium", "T1547.015")
A("89fa251e-13bb-4e2b-aace-9d3c701a54f2", "Security Agent Plugin", PE, "Authorization plugin created for persistence", "persistence",
  {"paths": ["/Library/Security/SecurityAgentPlugins"], "glob": "*", "check": "new"}, "critical", "T1547.002")
A("4ec4d863-dbde-4a95-9f47-c772bda488d1", "Spotlight Importer", PE, "Spotlight Importer created for persistence", "persistence",
  {"paths": ["/Library/Spotlight", "/Users/*/Library/Spotlight"], "glob": "*.mdimporter", "check": "new"}, "high", "T1547")
A("dfea835e-5953-4e27-bbb9-6492af79c858", "Startup Item", PE, "Startup Item created for persistence", "persistence",
  {"paths": ["/Library/StartupItems"], "glob": "*", "check": "new"}, "high", "T1037.005")
A("82412849-f4f5-47f5-9db9-f49ab56e15fb", "LaunchDaemon", PE, "LaunchDaemon created for persistence", "persistence",
  {"paths": ["/Library/LaunchDaemons"], "glob": "*.plist", "check": "new"}, "medium", "T1543.004")
A("8dda64ca-dbcc-11e9-a44c-acde48001122", "LaunchAgent", PE, "LaunchAgent created for persistence", "persistence",
  {"paths": ["/Library/LaunchAgents", "/Users/*/Library/LaunchAgents"], "glob": "*.plist", "check": "new"}, "medium", "T1543.001")
A("5e7a51f9-7f85-4b9a-8bef-465b0f1971c5", "Cron Job", PE, "Cron Job created for persistence", "persistence",
  {"paths": ["/usr/lib/cron/tabs", "/private/var/at/tabs"], "glob": "*", "check": "changed"}, "high", "T1053.003")
A("05deb365-dc2d-4f25-92b3-30c3a32602e4", "DYLD Insert(App)", PE, "DYLDInsert was used for persistence", "file_scan",
  {"paths": ["/Applications"], "check": "dyld_insert_app"}, "critical", "T1574.006")
A("36fa2359-d514-4688-b1ac-c557f8b2fe57", "DYLD Insert(launchd)", PE, "DYLDInsert created for persistence", "persistence",
  {"paths": LA, "glob": "*.plist", "check": "dyld_insert"}, "critical", "T1574.006")
A("97a98d39-8003-4d34-9c78-77db554a7c2f", "App Login Item", PE, "App Login Item created for persistence", "persistence",
  {"paths": ["/Applications/*.app/Contents/Library/LoginItems", "/Users/*/Applications/*.app/Contents/Library/LoginItems"], "glob": "*.app", "check": "new"}, "low", "T1547.015")

# ── Apple Security ───────────────────────────────────────────────────────────
AP = "Apple Security"
A("eb7fdf13-543b-455b-92a6-999646e5c944", "XProtect Detection", AP, "Malicious application detected by XProtect", "log",
  {"predicate": 'subsystem BEGINSWITH "com.apple.XProtect" OR process == "XProtect" OR process == "XprotectService"',
   "regex": r"(?i)(malware|detected|remediat|signature match|XProtectPlistConfigData.*match)"}, "critical", "T1204.002")
A("b83111e8-9f75-419a-8513-d625c6b64cb4", "Gatekeeper Blocked Revoked", AP, "Gatekeeper blocked a revoked app", "log",
  {"predicate": 'process == "syspolicyd"', "regex": r"(?i)revoked"}, "high", "T1553.001")
A("9806766e-fe88-11e9-bf22-acde48001122", "Gatekeeper Blocked Signed", AP, "Gatekeeper blocked execution of application", "log",
  {"predicate": 'process == "syspolicyd"', "regex": r"(?i)(assessment denied|rejected).*(signed|notariz)"}, "medium", "T1553.001")
A("40314161-fe88-11e9-893a-acde48001122", "Gatekeeper Blocked Unsigned Or Unknown", AP, "Gatekeeper blocked an application", "log",
  {"predicate": 'process == "syspolicyd"', "regex": r"(?i)(assessment denied|rejected).*(unsigned|no usable signature|unknown developer)"}, "medium", "T1553.001")

assert len(CAT) == 156, len(CAT)

def q(s):  # SQL dollar-quote helper
    return "$q$" + s + "$q$" if s is not None else "NULL"

rows = []
for c in CAT:
    rows.append("(" + ", ".join([q(c["id"]), q(c["source_ref"]), q(c["name"]), q(c["category"]), q(c["description"]),
        q(c["method"]), q(json.dumps(c["definition"])) + "::jsonb", q(c["severity"]), q(c["mitre"]),
        "true" if c["enabled"] else "false", "true" if c["method"] == "es_sensor" else "false"]) + ")")

sql = f"""-- Detection analytics catalogue ({len(CAT)} analytics, modelled on Jamf Protect). Generated by
-- backend/supabase/analytics_catalog.py — edit that file and regenerate rather than this one.
CREATE TABLE IF NOT EXISTS analytics (
  id           text PRIMARY KEY,
  source_ref   text,                        -- Jamf Protect analytic UUID this mirrors
  name         text NOT NULL,
  category     text NOT NULL,
  description  text,
  method       text NOT NULL,               -- how the agent detects it (see generator)
  definition   jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  severity     text NOT NULL DEFAULT 'high' CHECK (severity IN ('critical','high','medium','low','info')),
  mitre        text,
  enabled      boolean NOT NULL DEFAULT true,
  requires_es  boolean NOT NULL DEFAULT false,
  builtin      boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_agent_read ON analytics;
CREATE POLICY analytics_agent_read ON analytics FOR SELECT TO anon USING (enabled AND NOT requires_es);
DROP POLICY IF EXISTS console_member_read ON analytics;
CREATE POLICY console_member_read ON analytics FOR SELECT TO authenticated USING (is_console_member());
DROP POLICY IF EXISTS console_admin_write ON analytics;
CREATE POLICY console_admin_write ON analytics FOR UPDATE TO authenticated USING (is_console_admin()) WITH CHECK (is_console_admin());
GRANT SELECT ON analytics TO anon, authenticated;
GRANT UPDATE (enabled, severity, updated_at) ON analytics TO authenticated;
DROP TRIGGER IF EXISTS audit_analytics ON analytics;
CREATE TRIGGER audit_analytics AFTER UPDATE ON analytics FOR EACH ROW EXECUTE FUNCTION audit_row_change();

INSERT INTO analytics (id, source_ref, name, category, description, method, definition, severity, mitre, enabled, requires_es) VALUES
{",\n".join(rows)}
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, description = EXCLUDED.description,
  method = EXCLUDED.method, definition = EXCLUDED.definition, mitre = EXCLUDED.mitre, requires_es = EXCLUDED.requires_es,
  source_ref = EXCLUDED.source_ref, updated_at = now();
"""
out = Path(__file__).parent / "migrations" / "025_analytics_catalog.sql"
out.write_text(sql)
from collections import Counter
print(f"wrote {out} — {len(CAT)} analytics")
print(Counter(c["category"] for c in CAT))
print(Counter(c["method"] for c in CAT))
