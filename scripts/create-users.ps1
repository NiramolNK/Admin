# ═══════════════════════════════════════════════════════════════════
# NiRM Roster — bulk user creation
# Run this yourself: it reads users.csv + asks for your service key.
# Creates Supabase auth users (no confirmation emails needed) and
# writes each person's role into the app so first login just works.
#
# USAGE:
#   1. Fill the Password column in users.csv (same folder as repo root)
#   2. powershell -ExecutionPolicy Bypass -File .\scripts\create-users.ps1
#   3. Paste the service_role key when prompted
#      (Supabase -> Project Settings -> API -> service_role secret)
#   4. DELETE users.csv afterwards
# ═══════════════════════════════════════════════════════════════════

$URL = "https://bequrilwgooesolepubv.supabase.co"
$csvPath = Join-Path (Split-Path $PSScriptRoot -Parent) "users.csv"

if (-not (Test-Path $csvPath)) { Write-Host "users.csv not found at $csvPath" -ForegroundColor Red; exit 1 }

$key = Read-Host "Paste service_role key" -AsSecureString
$KEY = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
       [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($key))
$H = @{ "apikey" = $KEY; "Authorization" = "Bearer $KEY"; "Content-Type" = "application/json" }

# Map spreadsheet roles -> app role keys
$roleMap = @{ "T1"="t1"; "RT&RF"="return"; "RTRF"="return"; "VIEWER"="viewer";
              "FULLTIME"="fulltime"; "MANAGER"="manager"; "CC"="cc" }

$rows = Import-Csv $csvPath
Write-Host "Found $($rows.Count) users in users.csv`n"
$created = 0; $failed = 0; $roleEntries = @()

foreach ($r in $rows) {
  $email = $r.Email.Trim().ToLower(); $name = $r.Name.Trim()
  $roleRaw = $r.role.Trim().ToUpper(); $pass = ($r.Password + "").Trim()
  if (-not $email -or -not $pass) { Write-Host "SKIP $email (missing email/password)" -ForegroundColor Yellow; $failed++; continue }
  $role = $roleMap[$roleRaw]; if (-not $role) { $role = "viewer"; Write-Host "  note: unknown role '$roleRaw' for $email -> viewer" -ForegroundColor Yellow }

  $body = @{ email=$email; password=$pass; email_confirm=$true; user_metadata=@{ name=$name } } | ConvertTo-Json
  try {
    $u = Invoke-RestMethod -Method Post -Uri "$URL/auth/v1/admin/users" -Headers $H -Body $body
    Write-Host "CREATED $email  ($name, $role)" -ForegroundColor Green
    $created++
    # Best-effort: set role in profiles table too (app reads it as fallback)
    try {
      $pb = @{ id=$u.id; role=$role; username=$name } | ConvertTo-Json
      Invoke-RestMethod -Method Post -Uri "$URL/rest/v1/profiles" -Headers ($H + @{ "Prefer"="resolution=merge-duplicates" }) -Body $pb | Out-Null
    } catch {
      try {
        $pb2 = @{ id=$u.id; role=$role } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "$URL/rest/v1/profiles" -Headers ($H + @{ "Prefer"="resolution=merge-duplicates" }) -Body $pb2 | Out-Null
      } catch { Write-Host "  note: profiles row not written ($($_.Exception.Message)) - role still set via app list below" -ForegroundColor Yellow }
    }
  } catch {
    $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host "FAILED  $email  -> $msg" -ForegroundColor Red; $failed++
    if ($msg -notmatch "already") { continue }
  }
  $roleEntries += @{ username = $email; password = "__supabase__"; role = $role }
}

# ── Write roles into the app's account list (kv_state: nirm-userAccounts) ──
# The app checks this list FIRST on login, so roles apply immediately.
# Entries hold no real passwords - just the "__supabase__" marker.
Write-Host "`nWriting roles into the app account list..."
try {
  $row = Invoke-RestMethod -Method Get -Uri "$URL/rest/v1/kv_state?key=eq.nirm-userAccounts&select=key,value,version" -Headers $H
  if ($row.Count -eq 0) {
    $list = @($roleEntries)
    $val = @{ __wasString = $true; v = $list }
    $body = @{ key="nirm-userAccounts"; value=$val; version=1 } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Method Post -Uri "$URL/rest/v1/kv_state" -Headers $H -Body $body | Out-Null
  } else {
    $cur = $row[0].value; $ver = $row[0].version
    $wasString = $false; $list = @()
    if ($cur.PSObject.Properties["__wasString"]) { $wasString = $true; $list = @($cur.v) } else { $list = @($cur) }
    foreach ($e in $roleEntries) {
      $hit = $list | Where-Object { $_.username -and $_.username.ToLower() -eq $e.username.ToLower() }
      if ($hit) { $hit.role = $e.role }
      else { $list += [pscustomobject]$e }
    }
    if ($wasString) { $newVal = @{ __wasString = $true; v = $list } } else { $newVal = $list }
    $body = @{ value = $newVal; version = ($ver + 1) } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Method Patch -Uri "$URL/rest/v1/kv_state?key=eq.nirm-userAccounts&version=eq.$ver" -Headers $H -Body $body | Out-Null
  }
  Write-Host "Roles written for $($roleEntries.Count) users." -ForegroundColor Green
} catch {
  Write-Host "Could not update app account list: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "Roles will fall back to profiles/viewer - fix any in the app's Users panel." -ForegroundColor Yellow
}

Write-Host "`nDone: $created created, $failed failed."
Write-Host "NOW DELETE users.csv - it contains plaintext passwords." -ForegroundColor Red
