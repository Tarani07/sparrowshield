# ============================================================
#  SparrowShield Agent — One-Click Installer for Windows
#  Run as Admin:
#    powershell -ExecutionPolicy Bypass -File sparrow-install.ps1
#  Or via URL:
#    powershell -ExecutionPolicy Bypass -c "iwr <url> -UseBasicParsing | iex"
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       SparrowShield Agent — Windows Installation         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── [1/5] Setup paths ─────────────────────────────────────────────────────────
$InstallDir = "C:\ProgramData\SparrowShield"
$AgentPy    = "$InstallDir\agent_windows.py"
$ConfigJson = "$InstallDir\config.json"
$LogFile    = "$InstallDir\agent.log"
$TaskName   = "SparrowShieldAgent"

Write-Host "[1/5] Setting up installation directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host "      Install dir: $InstallDir" -ForegroundColor Gray

# ── [2/5] Extract agent code ──────────────────────────────────────────────────
Write-Host "[2/5] Extracting agent files..." -ForegroundColor Yellow

$AgentB64 = @"
IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMwoiIiIKSGVhbFNwYXJyb3cgV2luZG93cyBhZ2VudCDigJQgY29sbGVjdHMgc3lzdGVtIG1ldHJpY3MgYW5kIGludmVudG9yeSwgc2VuZHMgdG8gYmFja2VuZC4KIiIiCgppbXBvcnQganNvbgppbXBvcnQgbG9nZ2luZwppbXBvcnQgb3MKaW1wb3J0IHBsYXRmb3JtCmltcG9ydCBzdWJwcm9jZXNzCmltcG9ydCBzeXMKaW1wb3J0IHRocmVhZGluZwppbXBvcnQgdGltZQpmcm9tIHBhdGhsaWIgaW1wb3J0IFBhdGgKCmltcG9ydCBwc3V0aWwKaW1wb3J0IHJlcXVlc3RzCgpMT0dfRElSID0gb3MuZW52aXJvbi5nZXQoIlByb2dyYW1EYXRhIiwgIkM6XFxQcm9ncmFtRGF0YSIpCkxPR19QQVRIID0gb3MucGF0aC5qb2luKExPR19ESVIsICJIZWFsU3BhcnJvdyIsICJhZ2VudC5sb2ciKQpDT05GSUdfUEFUSCA9IG9zLnBhdGguam9pbihvcy5wYXRoLmRpcm5hbWUob3MucGF0aC5hYnNwYXRoKF9fZmlsZV9fKSksICJjb25maWcuanNvbiIpCkhFQVJUQkVBVF9JTlRFUlZBTCA9IDMwMApJTlZFTlRPUllfSU5URVJWQUwgPSAzNjAwCgoKZGVmIHNldHVwX2xvZ2dpbmcoKToKICAgIHRyeToKICAgICAgICBQYXRoKExPR19ESVIsICJIZWFsU3BhcnJvdyIpLm1rZGlyKHBhcmVudHM9VHJ1ZSwgZXhpc3Rfb2s9VHJ1ZSkKICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgIHBhc3MKICAgIHRyeToKICAgICAgICBsb2dnaW5nLmJhc2ljQ29uZmlnKAogICAgICAgICAgICBsZXZlbD1sb2dnaW5nLklORk8sCiAgICAgICAgICAgIGZvcm1hdD0iJShhc2N0aW1lKXMgWyUobGV2ZWxuYW1lKXNdICUobWVzc2FnZSlzIiwKICAgICAgICAgICAgaGFuZGxlcnM9WwogICAgICAgICAgICAgICAgbG9nZ2luZy5GaWxlSGFuZGxlcihMT0dfUEFUSCwgZW5jb2Rpbmc9InV0Zi04IiksCiAgICAgICAgICAgICAgICBsb2dnaW5nLlN0cmVhbUhhbmRsZXIoc3lzLnN0ZGVyciksCiAgICAgICAgICAgIF0sCiAgICAgICAgKQogICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgbG9nZ2luZy5iYXNpY0NvbmZpZygKICAgICAgICAgICAgbGV2ZWw9bG9nZ2luZy5JTkZPLAogICAgICAgICAgICBmb3JtYXQ9IiUoYXNjdGltZSlzIFslKGxldmVsbmFtZSlzXSAlKG1lc3NhZ2UpcyIsCiAgICAgICAgICAgIGhhbmRsZXJzPVtsb2dnaW5nLlN0cmVhbUhhbmRsZXIoc3lzLnN0ZGVycildLAogICAgICAgICkKICAgIHJldHVybiBsb2dnaW5nLmdldExvZ2dlcihfX25hbWVfXykKCgpsb2dnZXIgPSBzZXR1cF9sb2dnaW5nKCkKCgpkZWYgbG9hZF9jb25maWcoKToKICAgIHBhdGggPSBQYXRoKENPTkZJR19QQVRIKQogICAgaWYgbm90IHBhdGguZXhpc3RzKCk6CiAgICAgICAgcmV0dXJuIHt9CiAgICB0cnk6CiAgICAgICAgd2l0aCBvcGVuKHBhdGgsICJyIiwgZW5jb2Rpbmc9InV0Zi04IikgYXMgZjoKICAgICAgICAgICAgcmV0dXJuIGpzb24ubG9hZChmKQogICAgZXhjZXB0IChqc29uLkpTT05EZWNvZGVFcnJvciwgT1NFcnJvcikgYXMgZToKICAgICAgICBsb2dnZXIud2FybmluZygiQ291bGQgbm90IGxvYWQgY29uZmlnOiAlcyIsIGUpCiAgICAgICAgcmV0dXJuIHt9CgoKZGVmIHNhdmVfY29uZmlnKGNvbmZpZyk6CiAgICBwYXRoID0gUGF0aChDT05GSUdfUEFUSCkKICAgIHRyeToKICAgICAgICB3aXRoIG9wZW4ocGF0aCwgInciLCBlbmNvZGluZz0idXRmLTgiKSBhcyBmOgogICAgICAgICAgICBqc29uLmR1bXAoY29uZmlnLCBmLCBpbmRlbnQ9MikKICAgIGV4Y2VwdCBPU0Vycm9yIGFzIGU6CiAgICAgICAgbG9nZ2VyLmVycm9yKCJDb3VsZCBub3Qgc2F2ZSBjb25maWc6ICVzIiwgZSkKCgpkZWYgZ2V0X3dpbmRvd3Nfc2VyaWFsKCk6CiAgICB0cnk6CiAgICAgICAgciA9IHN1YnByb2Nlc3MucnVuKAogICAgICAgICAgICBbIndtaWMiLCAiYmlvcyIsICJnZXQiLCAic2VyaWFsbnVtYmVyIl0sCiAgICAgICAgICAgIGNhcHR1cmVfb3V0cHV0PVRydWUsCiAgICAgICAgICAgIHRleHQ9VHJ1ZSwKICAgICAgICAgICAgdGltZW91dD0xMCwKICAgICAgICAgICAgY3JlYXRpb25mbGFncz1zdWJwcm9jZXNzLkNSRUFURV9OT19XSU5ET1cgaWYgc3lzLnBsYXRmb3JtID09ICJ3aW4zMiIgZWxzZSAwLAogICAgICAgICkKICAgICAgICBpZiByLnJldHVybmNvZGUgPT0gMCBhbmQgci5zdGRvdXQ6CiAgICAgICAgICAgIGxpbmVzID0gW2wuc3RyaXAoKSBmb3IgbCBpbiByLnN0ZG91dC5zdHJpcCgpLnNwbGl0bGluZXMoKSBpZiBsLnN0cmlwKCldCiAgICAgICAgICAgIGlmIGxlbihsaW5lcykgPj0gMjoKICAgICAgICAgICAgICAgIHJldHVybiBsaW5lc1stMV0gb3IgInVua25vd24iCiAgICBleGNlcHQgKHN1YnByb2Nlc3MuVGltZW91dEV4cGlyZWQsIEZpbGVOb3RGb3VuZEVycm9yKToKICAgICAgICBwYXNzCiAgICByZXR1cm4gInVua25vd24iCgoKZGVmIGVucm9sbChhcGlfdXJsOiBzdHIsIGNvbmZpZzogZGljdCkgLT4gYm9vbDoKICAgIGhvc3RuYW1lID0gcGxhdGZvcm0ubm9kZSgpCiAgICBzZXJpYWxfbnVtYmVyID0gZ2V0X3dpbmRvd3Nfc2VyaWFsKCkKICAgIG9zX3R5cGUgPSAid2luZG93cyIKICAgIG9zX3ZlcnNpb24gPSBwbGF0Zm9ybS53aW4zMl92ZXIoKVsxXSBvciBwbGF0Zm9ybS5yZWxlYXNlKCkKCiAgICAjIEhhcmR3YXJlIGNvbmZpZwogICAgY3B1X21vZGVsID0gcGxhdGZvcm0ucHJvY2Vzc29yKCkgb3IgInVua25vd24iCiAgICB0cnk6CiAgICAgICAgciA9IHN1YnByb2Nlc3MucnVuKAogICAgICAgICAgICBbIndtaWMiLCAiY3B1IiwgImdldCIsICJOYW1lIiwgIi9mb3JtYXQ6dmFsdWUiXSwKICAgICAgICAgICAgY2FwdHVyZV9vdXRwdXQ9VHJ1ZSwgdGV4dD1UcnVlLCB0aW1lb3V0PTEwLAogICAgICAgICAgICBjcmVhdGlvbmZsYWdzPXN1YnByb2Nlc3MuQ1JFQVRFX05PX1dJTkRPVyBpZiBzeXMucGxhdGZvcm0gPT0gIndpbjMyIiBlbHNlIDAsCiAgICAgICAgKQogICAgICAgIGZvciBsaW5lIGluIHIuc3Rkb3V0LnNwbGl0bGluZXMoKToKICAgICAgICAgICAgaWYgbGluZS5zdGFydHN3aXRoKCJOYW1lPSIpIGFuZCBsaW5lWzU6XS5zdHJpcCgpOgogICAgICAgICAgICAgICAgY3B1X21vZGVsID0gbGluZVs1Ol0uc3RyaXAoKQogICAgICAgICAgICAgICAgYnJlYWsKICAgIGV4Y2VwdCAoc3VicHJvY2Vzcy5UaW1lb3V0RXhwaXJlZCwgRmlsZU5vdEZvdW5kRXJyb3IpOgogICAgICAgIHBhc3MKICAgIGNwdV9jb3JlcyA9IHBzdXRpbC5jcHVfY291bnQobG9naWNhbD1GYWxzZSkgb3IgcHN1dGlsLmNwdV9jb3VudCgpCiAgICByYW1fdG90YWxfZ2IgPSByb3VuZChwc3V0aWwudmlydHVhbF9tZW1vcnkoKS50b3RhbCAvICgxMDI0ICoqIDMpLCAyKQoKICAgIGJvZHkgPSB7CiAgICAgICAgImhvc3RuYW1lIjogaG9zdG5hbWUsCiAgICAgICAgInNlcmlhbF9udW1iZXIiOiBzZXJpYWxfbnVtYmVyLAogICAgICAgICJvc190eXBlIjogb3NfdHlwZSwKICAgICAgICAib3NfdmVyc2lvbiI6IG9zX3ZlcnNpb24sCiAgICAgICAgImFzc2lnbmVkX3VzZXIiOiBvcy5lbnZpcm9uLmdldCgiVVNFUk5BTUUiLCAiIiksCiAgICAgICAgImRlcGFydG1lbnQiOiAiIiwKICAgICAgICAiY3B1X21vZGVsIjogY3B1X21vZGVsLAogICAgICAgICJjcHVfY29yZXMiOiBjcHVfY29yZXMsCiAgICAgICAgInJhbV90b3RhbF9nYiI6IHJhbV90b3RhbF9nYiwKICAgIH0KCiAgICBmb3IgYXR0ZW1wdCBpbiByYW5nZSgzKToKICAgICAgICB0cnk6CiAgICAgICAgICAgIHIgPSByZXF1ZXN0cy5wb3N0KAogICAgICAgICAgICAgICAgZiJ7YXBpX3VybH0vZW5yb2xsIiwKICAgICAgICAgICAgICAgIGpzb249Ym9keSwKICAgICAgICAgICAgICAgIGhlYWRlcnM9eyJDb250ZW50LVR5cGUiOiAiYXBwbGljYXRpb24vanNvbiJ9LAogICAgICAgICAgICAgICAgdGltZW91dD0zMCwKICAgICAgICAgICAgKQogICAgICAgICAgICBkYXRhID0gci5qc29uKCkKICAgICAgICAgICAgaWYgci5zdGF0dXNfY29kZSA9PSAyMDAgYW5kIGRhdGEuZ2V0KCJzdWNjZXNzIikgYW5kIGRhdGEuZ2V0KCJkYXRhIik6CiAgICAgICAgICAgICAgICBkID0gZGF0YVsiZGF0YSJdCiAgICAgICAgICAgICAgICBjb25maWdbImRldmljZV9pZCJdID0gc3RyKGRbImRldmljZV9pZCJdKQogICAgICAgICAgICAgICAgY29uZmlnWyJkZXZpY2VfdG9rZW4iXSA9IGRbInRva2VuIl0KICAgICAgICAgICAgICAgIHNhdmVfY29uZmlnKGNvbmZpZykKICAgICAgICAgICAgICAgIGxvZ2dlci5pbmZvKCJFbnJvbGxlZCBzdWNjZXNzZnVsbHk6IGRldmljZV9pZD0lcyIsIGNvbmZpZ1siZGV2aWNlX2lkIl0pCiAgICAgICAgICAgICAgICByZXR1cm4gVHJ1ZQogICAgICAgICAgICBsb2dnZXIud2FybmluZygiRW5yb2xsIGZhaWxlZDogJXMgJXMiLCByLnN0YXR1c19jb2RlLCBkYXRhLmdldCgiZXJyb3IiKSkKICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIGxvZ2dlci53YXJuaW5nKCJFbnJvbGwgYXR0ZW1wdCAlcyBmYWlsZWQ6ICVzIiwgYXR0ZW1wdCArIDEsIGUpCiAgICAgICAgdGltZS5zbGVlcCgyICoqIGF0dGVtcHQpCiAgICByZXR1cm4gRmFsc2UKCgpkZWYgcmV0cnlfcmVxdWVzdChtZXRob2QsIHVybCwgKiprd2FyZ3MpOgogICAgbGFzdF9lcnJvciA9IE5vbmUKICAgIGZvciBhdHRlbXB0IGluIHJhbmdlKDUpOgogICAgICAgIHRyeToKICAgICAgICAgICAgciA9IG1ldGhvZCh1cmwsICoqa3dhcmdzKQogICAgICAgICAgICBpZiByLnN0YXR1c19jb2RlIGluICgyMDAsIDIwMSwgMjA0KToKICAgICAgICAgICAgICAgIHJldHVybiByCiAgICAgICAgICAgIGlmIHIuc3RhdHVzX2NvZGUgaW4gKDQwMSwgNDAzLCA0MDQpOgogICAgICAgICAgICAgICAgcmV0dXJuIHIKICAgICAgICAgICAgbGFzdF9lcnJvciA9IHIudGV4dAogICAgICAgIGV4Y2VwdCByZXF1ZXN0cy5SZXF1ZXN0RXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIGxhc3RfZXJyb3IgPSBlCiAgICAgICAgdGltZS5zbGVlcCgyICoqIGF0dGVtcHQpCiAgICByYWlzZSBsYXN0X2Vycm9yCgoKZGVmIGdldF9iaXRsb2NrZXJfc3RhdHVzKCkgLT4gYm9vbDoKICAgIHRyeToKICAgICAgICByID0gc3VicHJvY2Vzcy5ydW4oCiAgICAgICAgICAgIFsibWFuYWdlLWJkZSIsICItc3RhdHVzIiwgIkM6Il0sCiAgICAgICAgICAgIGNhcHR1cmVfb3V0cHV0PVRydWUsCiAgICAgICAgICAgIHRleHQ9VHJ1ZSwKICAgICAgICAgICAgdGltZW91dD0xNSwKICAgICAgICAgICAgY3JlYXRpb25mbGFncz1zdWJwcm9jZXNzLkNSRUFURV9OT19XSU5ET1cgaWYgc3lzLnBsYXRmb3JtID09ICJ3aW4zMiIgZWxzZSAwLAogICAgICAgICkKICAgICAgICBpZiByLnJldHVybmNvZGUgPT0gMDoKICAgICAgICAgICAgcmV0dXJuICJQcm90ZWN0aW9uIE9uIiBpbiByLnN0ZG91dCBvciAiRnVsbHkgRW5jcnlwdGVkIiBpbiByLnN0ZG91dAogICAgZXhjZXB0IChzdWJwcm9jZXNzLlRpbWVvdXRFeHBpcmVkLCBGaWxlTm90Rm91bmRFcnJvcik6CiAgICAgICAgcGFzcwogICAgcmV0dXJuIEZhbHNlCgoKZGVmIGdldF9maXJld2FsbF9zdGF0dXMoKSAtPiBib29sOgogICAgdHJ5OgogICAgICAgIHIgPSBzdWJwcm9jZXNzLnJ1bigKICAgICAgICAgICAgWwogICAgICAgICAgICAgICAgInBvd2Vyc2hlbGwiLAogICAgICAgICAgICAgICAgIi1Ob1Byb2ZpbGUiLAogICAgICAgICAgICAgICAgIi1Db21tYW5kIiwKICAgICAgICAgICAgICAgICJHZXQtTmV0RmlyZXdhbGxQcm9maWxlIHwgU2VsZWN0LU9iamVjdCBOYW1lLCBFbmFibGVkIiwKICAgICAgICAgICAgXSwKICAgICAgICAgICAgY2FwdHVyZV9vdXRwdXQ9VHJ1ZSwKICAgICAgICAgICAgdGV4dD1UcnVlLAogICAgICAgICAgICB0aW1lb3V0PTE1LAogICAgICAgICAgICBjcmVhdGlvbmZsYWdzPXN1YnByb2Nlc3MuQ1JFQVRFX05PX1dJTkRPVyBpZiBzeXMucGxhdGZvcm0gPT0gIndpbjMyIiBlbHNlIDAsCiAgICAgICAgKQogICAgICAgIGlmIHIucmV0dXJuY29kZSA9PSAwIGFuZCByLnN0ZG91dDoKICAgICAgICAgICAgZm9yIGxpbmUgaW4gci5zdGRvdXQuc3BsaXRsaW5lcygpOgogICAgICAgICAgICAgICAgaWYgIkRvbWFpbiIgaW4gbGluZSBvciAiUHJpdmF0ZSIgaW4gbGluZSBvciAiUHVibGljIiBpbiBsaW5lOgogICAgICAgICAgICAgICAgICAgIGlmICJUcnVlIiBpbiBsaW5lOgogICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gVHJ1ZQogICAgICAgICAgICByZXR1cm4gIlRydWUiIGluIHIuc3Rkb3V0CiAgICBleGNlcHQgKHN1YnByb2Nlc3MuVGltZW91dEV4cGlyZWQsIEZpbGVOb3RGb3VuZEVycm9yKToKICAgICAgICBwYXNzCiAgICByZXR1cm4gRmFsc2UKCgpkZWYgY29sbGVjdF9tZXRyaWNzKCkgLT4gZGljdDoKICAgIHZtID0gcHN1dGlsLnZpcnR1YWxfbWVtb3J5KCkKICAgIGRpc2sgPSBwc3V0aWwuZGlza191c2FnZSgiQzpcXCIpCiAgICBjcHVfcGN0ID0gcHN1dGlsLmNwdV9wZXJjZW50KGludGVydmFsPTIpCiAgICB1cHRpbWVfc2Vjb25kcyA9IGludCh0aW1lLnRpbWUoKSAtIHBzdXRpbC5ib290X3RpbWUoKSkgaWYgaGFzYXR0cihwc3V0aWwsICJib290X3RpbWUiKSBlbHNlIDAKCiAgICBiYXR0ZXJ5X2hlYWx0aF9wY3QgPSBOb25lCiAgICBiYXR0ZXJ5X2N5Y2xlcyA9IE5vbmUKICAgIGlmIGhhc2F0dHIocHN1dGlsLCAic2Vuc29yc19iYXR0ZXJ5IikgYW5kIHBzdXRpbC5zZW5zb3JzX2JhdHRlcnkoKToKICAgICAgICBiYXQgPSBwc3V0aWwuc2Vuc29yc19iYXR0ZXJ5KCkKICAgICAgICBiYXR0ZXJ5X2hlYWx0aF9wY3QgPSBnZXRhdHRyKGJhdCwgInBlcmNlbnQiLCBOb25lKQoKICAgIHJldHVybiB7CiAgICAgICAgImNwdV9wY3QiOiByb3VuZChjcHVfcGN0LCAyKSwKICAgICAgICAicmFtX3BjdCI6IHJvdW5kKHZtLnBlcmNlbnQsIDIpLAogICAgICAgICJyYW1fdG90YWxfZ2IiOiByb3VuZCh2bS50b3RhbCAvICgxMDI0ICoqIDMpLCAyKSwKICAgICAgICAiZGlza19wY3QiOiByb3VuZChkaXNrLnBlcmNlbnQsIDIpLAogICAgICAgICJkaXNrX3RvdGFsX2diIjogcm91bmQoZGlzay50b3RhbCAvICgxMDI0ICoqIDMpLCAyKSwKICAgICAgICAiYmF0dGVyeV9oZWFsdGhfcGN0IjogYmF0dGVyeV9oZWFsdGhfcGN0LAogICAgICAgICJiYXR0ZXJ5X2N5Y2xlcyI6IGJhdHRlcnlfY3ljbGVzLAogICAgICAgICJ1cHRpbWVfc2Vjb25kcyI6IHVwdGltZV9zZWNvbmRzLAogICAgICAgICJmaWxldmF1bHRfZW5hYmxlZCI6IE5vbmUsCiAgICAgICAgImJpdGxvY2tlcl9lbmFibGVkIjogZ2V0X2JpdGxvY2tlcl9zdGF0dXMoKSwKICAgICAgICAiZmlyZXdhbGxfZW5hYmxlZCI6IGdldF9maXJld2FsbF9zdGF0dXMoKSwKICAgIH0KCgpkZWYgaGVhcnRiZWF0X2xvb3AoYXBpX3VybDogc3RyLCB0b2tlbjogc3RyKToKICAgIHdoaWxlIFRydWU6CiAgICAgICAgdHJ5OgogICAgICAgICAgICBtZXRyaWNzID0gY29sbGVjdF9tZXRyaWNzKCkKICAgICAgICAgICAgciA9IHJldHJ5X3JlcXVlc3QoCiAgICAgICAgICAgICAgICByZXF1ZXN0cy5wb3N0LAogICAgICAgICAgICAgICAgZiJ7YXBpX3VybH0vaGVhcnRiZWF0IiwKICAgICAgICAgICAgICAgIGpzb249bWV0cmljcywKICAgICAgICAgICAgICAgIGhlYWRlcnM9ewogICAgICAgICAgICAgICAgICAgICJDb250ZW50LVR5cGUiOiAiYXBwbGljYXRpb24vanNvbiIsCiAgICAgICAgICAgICAgICAgICAgIkF1dGhvcml6YXRpb24iOiBmIkJlYXJlciB7dG9rZW59IiwKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB0aW1lb3V0PTMwLAogICAgICAgICAgICApCiAgICAgICAgICAgIGlmIHIuc3RhdHVzX2NvZGUgPT0gMjAwOgogICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKCJIZWFydGJlYXQgT0siKQogICAgICAgICAgICBlbGlmIHIuc3RhdHVzX2NvZGUgPT0gNDAxOgogICAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCJUb2tlbiBpbnZhbGlkIG9yIHJldm9rZWQ7IHJlLWVucm9sbCByZXF1aXJlZCIpCiAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICBsb2dnZXIuZXhjZXB0aW9uKCJIZWFydGJlYXQgZmFpbGVkOiAlcyIsIGUpCiAgICAgICAgdGltZS5zbGVlcChIRUFSVEJFQVRfSU5URVJWQUwpCgoKZGVmIGdldF9zb2Z0d2FyZV9saXN0KCk6CiAgICByZXN1bHQgPSBbXQogICAgdHJ5OgogICAgICAgIHIgPSBzdWJwcm9jZXNzLnJ1bigKICAgICAgICAgICAgWyJ3bWljIiwgInByb2R1Y3QiLCAiZ2V0IiwgIm5hbWUsdmVyc2lvbiIsICIvZm9ybWF0OmNzdiJdLAogICAgICAgICAgICBjYXB0dXJlX291dHB1dD1UcnVlLAogICAgICAgICAgICB0ZXh0PVRydWUsCiAgICAgICAgICAgIHRpbWVvdXQ9NjAsCiAgICAgICAgICAgIGNyZWF0aW9uZmxhZ3M9c3VicHJvY2Vzcy5DUkVBVEVfTk9fV0lORE9XIGlmIHN5cy5wbGF0Zm9ybSA9PSAid2luMzIiIGVsc2UgMCwKICAgICAgICApCiAgICAgICAgaWYgci5yZXR1cm5jb2RlICE9IDAgb3Igbm90IHIuc3Rkb3V0OgogICAgICAgICAgICByZXR1cm4gW10KICAgICAgICBsaW5lcyA9IFtsLnN0cmlwKCkgZm9yIGwgaW4gci5zdGRvdXQuc3RyaXAoKS5zcGxpdGxpbmVzKCkgaWYgbC5zdHJpcCgpXQogICAgICAgIGlmIGxlbihsaW5lcykgPCAyOgogICAgICAgICAgICByZXR1cm4gW10KICAgICAgICBrZXlzID0gW2suc3RyaXAoKSBmb3IgayBpbiBsaW5lc1swXS5zcGxpdCgiLCIpXQogICAgICAgIG5hbWVfaWR4ID0gbmV4dCgoaSBmb3IgaSwgayBpbiBlbnVtZXJhdGUoa2V5cykgaWYgIm5hbWUiIGluIGsubG93ZXIoKSksIDApCiAgICAgICAgdmVyc2lvbl9pZHggPSBuZXh0KChpIGZvciBpLCBrIGluIGVudW1lcmF0ZShrZXlzKSBpZiAidmVyc2lvbiIgaW4gay5sb3dlcigpKSwgMSkKICAgICAgICBmb3IgbGluZSBpbiBsaW5lc1sxOl06CiAgICAgICAgICAgIHBhcnRzID0gW3Auc3RyaXAoKSBmb3IgcCBpbiBsaW5lLnNwbGl0KCIsIildCiAgICAgICAgICAgIGlmIGxlbihwYXJ0cykgPiBtYXgobmFtZV9pZHgsIHZlcnNpb25faWR4KToKICAgICAgICAgICAgICAgIG5hbWUgPSBwYXJ0c1tuYW1lX2lkeF0gb3IgIiIKICAgICAgICAgICAgICAgIHZlcnNpb24gPSBwYXJ0c1t2ZXJzaW9uX2lkeF0gaWYgdmVyc2lvbl9pZHggPCBsZW4ocGFydHMpIGVsc2UgIiIKICAgICAgICAgICAgICAgIGlmIG5hbWU6CiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmFwcGVuZCh7ImFwcF9uYW1lIjogbmFtZVs6MjU2XSwgInZlcnNpb24iOiBzdHIodmVyc2lvbilbOjEyOF19KQogICAgICAgIHJldHVybiByZXN1bHRbOjUwMF0KICAgIGV4Y2VwdCAoc3VicHJvY2Vzcy5UaW1lb3V0RXhwaXJlZCwgRmlsZU5vdEZvdW5kRXJyb3IpIGFzIGU6CiAgICAgICAgbG9nZ2VyLndhcm5pbmcoIlNvZnR3YXJlIGludmVudG9yeSBmYWlsZWQ6ICVzIiwgZSkKICAgICAgICByZXR1cm4gW10KCgpkZWYgZ2V0X3RvcF9wcm9jZXNzZXMobGltaXQ9MjApOgogICAgcmVzdWx0ID0gW10KICAgIHRyeToKICAgICAgICBwcm9jcyA9IFtdCiAgICAgICAgZm9yIHAgaW4gcHN1dGlsLnByb2Nlc3NfaXRlcihbIm5hbWUiLCAiY3B1X3BlcmNlbnQiLCAibWVtb3J5X2luZm8iXSk6CiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgIHBpbmZvID0gcC5pbmZvCiAgICAgICAgICAgICAgICBjcHUgPSBwaW5mby5nZXQoImNwdV9wZXJjZW50Iikgb3IgMAogICAgICAgICAgICAgICAgbWVtID0gKHBpbmZvLmdldCgibWVtb3J5X2luZm8iKSBvciB0eXBlKCJNIiwgKCksIHsicnNzIjogMH0pKCkpLnJzcwogICAgICAgICAgICAgICAgcHJvY3MuYXBwZW5kKChwaW5mby5nZXQoIm5hbWUiKSBvciBwLm5hbWUoKSwgY3B1LCBtZW0gLyAoMTAyNCAqIDEwMjQpKSkKICAgICAgICAgICAgZXhjZXB0IChwc3V0aWwuTm9TdWNoUHJvY2VzcywgcHN1dGlsLkFjY2Vzc0RlbmllZCk6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgIHByb2NzLnNvcnQoa2V5PWxhbWJkYSB4OiB4WzJdLCByZXZlcnNlPVRydWUpICAjIHNvcnQgYnkgUkFNICh4WzJdKSwgbm90IENQVQogICAgICAgIGZvciBuYW1lLCBjcHVfcGN0LCByYW1fbWIgaW4gcHJvY3NbOmxpbWl0XToKICAgICAgICAgICAgcmVzdWx0LmFwcGVuZCh7CiAgICAgICAgICAgICAgICAicHJvY2Vzc19uYW1lIjogKG5hbWUgb3IgInVua25vd24iKVs6MjU2XSwKICAgICAgICAgICAgICAgICJjcHVfcGN0Ijogcm91bmQoY3B1X3BjdCwgMiksCiAgICAgICAgICAgICAgICAicmFtX21iIjogcm91bmQocmFtX21iLCAyKSwKICAgICAgICAgICAgfSkKICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICBsb2dnZXIud2FybmluZygiUHJvY2VzcyBsaXN0IGZhaWxlZDogJXMiLCBlKQogICAgcmV0dXJuIHJlc3VsdAoKCmRlZiBpbnZlbnRvcnlfbG9vcChhcGlfdXJsOiBzdHIsIHRva2VuOiBzdHIpOgogICAgd2hpbGUgVHJ1ZToKICAgICAgICB0aW1lLnNsZWVwKElOVkVOVE9SWV9JTlRFUlZBTCkKICAgICAgICB0cnk6CiAgICAgICAgICAgIHNvZnR3YXJlID0gZ2V0X3NvZnR3YXJlX2xpc3QoKQogICAgICAgICAgICBwcm9jZXNzZXMgPSBnZXRfdG9wX3Byb2Nlc3NlcygyMCkKICAgICAgICAgICAgciA9IHJldHJ5X3JlcXVlc3QoCiAgICAgICAgICAgICAgICByZXF1ZXN0cy5wb3N0LAogICAgICAgICAgICAgICAgZiJ7YXBpX3VybH0vaW52ZW50b3J5IiwKICAgICAgICAgICAgICAgIGpzb249eyJzb2Z0d2FyZSI6IHNvZnR3YXJlLCAicHJvY2Vzc2VzIjogcHJvY2Vzc2VzfSwKICAgICAgICAgICAgICAgIGhlYWRlcnM9ewogICAgICAgICAgICAgICAgICAgICJDb250ZW50LVR5cGUiOiAiYXBwbGljYXRpb24vanNvbiIsCiAgICAgICAgICAgICAgICAgICAgIkF1dGhvcml6YXRpb24iOiBmIkJlYXJlciB7dG9rZW59IiwKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB0aW1lb3V0PTYwLAogICAgICAgICAgICApCiAgICAgICAgICAgIGlmIHIuc3RhdHVzX2NvZGUgPT0gMjAwOgogICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oIkludmVudG9yeSBzZW50OiAlcyBhcHBzLCAlcyBwcm9jZXNzZXMiLCBsZW4oc29mdHdhcmUpLCBsZW4ocHJvY2Vzc2VzKSkKICAgICAgICAgICAgZWxpZiByLnN0YXR1c19jb2RlID09IDQwMToKICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcigiVG9rZW4gaW52YWxpZDsgcmUtZW5yb2xsIHJlcXVpcmVkIikKICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIGxvZ2dlci5leGNlcHRpb24oIkludmVudG9yeSBmYWlsZWQ6ICVzIiwgZSkKCgpkZWYgbWFpbigpOgogICAgY29uZmlnID0gbG9hZF9jb25maWcoKQogICAgYXBpX3VybCA9IChjb25maWcuZ2V0KCJhcGlfdXJsIikgb3IgIiIpLnJzdHJpcCgiLyIpCiAgICBpZiBub3QgYXBpX3VybDoKICAgICAgICBsb2dnZXIuZXJyb3IoImNvbmZpZy5qc29uIG1pc3NpbmcgYXBpX3VybC4gU2V0IGFwaV91cmwgdG8geW91ciBTdXBhYmFzZSBmdW5jdGlvbnMgVVJMLiIpCiAgICAgICAgc3lzLmV4aXQoMSkKCiAgICBkZXZpY2VfaWQgPSBjb25maWcuZ2V0KCJkZXZpY2VfaWQiKQogICAgdG9rZW4gPSBjb25maWcuZ2V0KCJkZXZpY2VfdG9rZW4iKQoKICAgIGlmIG5vdCB0b2tlbiBvciBub3QgZGV2aWNlX2lkOgogICAgICAgIGxvZ2dlci5pbmZvKCJObyBkZXZpY2VfaWQvdG9rZW47IGVucm9sbGluZy4uLiIpCiAgICAgICAgaWYgbm90IGVucm9sbChhcGlfdXJsLCBjb25maWcpOgogICAgICAgICAgICBsb2dnZXIuZXJyb3IoIkVucm9sbG1lbnQgZmFpbGVkLiBDaGVjayBhcGlfdXJsIGFuZCBuZXR3b3JrLiIpCiAgICAgICAgICAgIHN5cy5leGl0KDEpCiAgICAgICAgdG9rZW4gPSBjb25maWcuZ2V0KCJkZXZpY2VfdG9rZW4iKQogICAgICAgIGRldmljZV9pZCA9IGNvbmZpZy5nZXQoImRldmljZV9pZCIpCgogICAgbG9nZ2VyLmluZm8oIlN0YXJ0aW5nIGFnZW50IGZvciBkZXZpY2VfaWQ9JXMiLCBkZXZpY2VfaWQpCgogICAgdCA9IHRocmVhZGluZy5UaHJlYWQodGFyZ2V0PWludmVudG9yeV9sb29wLCBhcmdzPShhcGlfdXJsLCB0b2tlbiksIGRhZW1vbj1UcnVlKQogICAgdC5zdGFydCgpCgogICAgaGVhcnRiZWF0X2xvb3AoYXBpX3VybCwgdG9rZW4pCgoKaWYgX19uYW1lX18gPT0gIl9fbWFpbl9fIjoKICAgIG1haW4oKQo=
"@

try {
    $bytes = [Convert]::FromBase64String($AgentB64.Trim())
    [System.IO.File]::WriteAllBytes($AgentPy, $bytes)
    Write-Host "      agent_windows.py extracted  ✓" -ForegroundColor Green
} catch {
    Write-Host "      Failed to extract agent: $_" -ForegroundColor Red
    exit 1
}

# Write config.json
$config = @{
    api_url      = "https://hevcfhxmjgbpozqtescm.supabase.co/functions/v1"
    anon_key     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
    device_id    = ""
    device_token = ""
} | ConvertTo-Json
Set-Content -Path $ConfigJson -Value $config -Encoding UTF8
Write-Host "      config.json created  ✓" -ForegroundColor Green

# ── [3/5] Ensure Python is installed ─────────────────────────────────────────
Write-Host "[3/5] Checking Python..." -ForegroundColor Yellow

$python = $null
foreach ($p in @("python", "python3", "py")) {
    try {
        $v = & $p --version 2>&1
        if ($v -match "Python 3") { $python = $p; break }
    } catch {}
}

if (-not $python) {
    Write-Host "      Python not found — installing via winget..." -ForegroundColor Yellow
    try {
        winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
        $python = "python"
        Write-Host "      Python installed  ✓" -ForegroundColor Green
    } catch {
        Write-Host "      winget failed — trying Microsoft Store..." -ForegroundColor Yellow
        Start-Process "ms-windows-store://pdp/?productid=9NRWMJLKF07" -ErrorAction SilentlyContinue
        Write-Host "      Please install Python 3 from the Store, then re-run this script." -ForegroundColor Red
        exit 1
    }
} else {
    $ver = & $python --version 2>&1
    Write-Host "      $ver found  ✓" -ForegroundColor Green
}

# Install dependencies
Write-Host "      Installing psutil + requests..." -ForegroundColor Gray
& $python -m pip install psutil requests --quiet --disable-pip-version-check 2>&1 | Out-Null
Write-Host "      psutil + requests installed  ✓" -ForegroundColor Green

# ── [4/5] Create Scheduled Task (auto-start on login) ────────────────────────
Write-Host "[4/5] Registering scheduled task..." -ForegroundColor Yellow

# Remove old task if exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$pythonPath = (Get-Command $python -ErrorAction SilentlyContinue)?.Source
if (-not $pythonPath) {
    $pythonPath = (& $python -c "import sys; print(sys.executable)" 2>&1).Trim()
}

$action  = New-ScheduledTaskAction -Execute $pythonPath -Argument "`"$AgentPy`"" -WorkingDirectory $InstallDir
$trigger = @(
    New-ScheduledTaskTrigger -AtLogOn,
    New-ScheduledTaskTrigger -AtStartup
)
$settings = New-ScheduledTaskSettingsSet 
    -RestartCount 5 
    -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount

try {
    Register-ScheduledTask 
        -Action $action 
        -Settings $settings 
        -Description "SparrowShield IT monitoring agent" | Out-Null
    Write-Host "      Scheduled task registered  ✓" -ForegroundColor Green
} catch {
    Write-Host "      Task registration failed (may need admin): $_" -ForegroundColor Red
}

# ── [5/5] Start agent now ─────────────────────────────────────────────────────
Write-Host "[5/5] Starting agent..." -ForegroundColor Yellow

try {
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    $state = (Get-ScheduledTask -TaskName $TaskName).State
    Write-Host "      Agent state: $state  ✓" -ForegroundColor Green
} catch {
    # Fallback: launch directly in background
    Start-Process $pythonPath -ArgumentList "`"$AgentPy`"" -WorkingDirectory $InstallDir -WindowStyle Hidden
    Write-Host "      Agent launched in background  ✓" -ForegroundColor Green
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              ✅  Installation Complete!                  ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Install dir : $InstallDir" -ForegroundColor Green
Write-Host "║  Agent log   : $LogFile" -ForegroundColor Green
Write-Host "║  Task name   : $TaskName" -ForegroundColor Green
Write-Host "║" -ForegroundColor Green
Write-Host "║  The agent runs as SYSTEM and auto-restarts on reboot.   ║" -ForegroundColor Green
Write-Host "║  Device appears in dashboard within 5 minutes.           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
