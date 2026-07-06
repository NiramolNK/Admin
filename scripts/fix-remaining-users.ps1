# Targeted repair after bulk run 2026-07-06:
#  - 02 Joy (nattakran.k) + 09 Aof (customerservice.extrtrf): 422 = likely pre-existing
#    -> if user exists: set password from sheet + confirm email; else create
#  - 15 Marker: retry profiles row, print real error
#  - merge fixed users into app account list (kv nirm-userAccounts)
$URL = "https://bequrilwgooesolepubv.supabase.co"
$PSDefaultParameterValues['Invoke-RestMethod:UserAgent'] = 'nirm-bulk-user-script/1.0'
$KEY = $env:NIRM_SERVICE_KEY
if (-not $KEY) { Write-Host "NIRM_SERVICE_KEY not set" -ForegroundColor Red; exit 1 }
$H = @{ "apikey"=$KEY; "Authorization"="Bearer $KEY"; "Content-Type"="application/json" }

$csvPath = Join-Path (Split-Path $PSScriptRoot -Parent) "users.csv"
if (-not (Test-Path $csvPath)) { Write-Host "users.csv not found" -ForegroundColor Red; exit 1 }
$rows = Import-Csv $csvPath
$want = @{ "02"="t1"; "09"="return" }

$all = Invoke-RestMethod -Method Get -Uri "$URL/auth/v1/admin/users?per_page=1000" -Headers $H
$users = $all.users
Write-Host "Auth users currently in project: $($users.Count)"

function Set-Profile($id, $role) {
  try {
    $pb = @{ id=$id; role=$role } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$URL/rest/v1/profiles" -Headers ($H + @{ "Prefer"="resolution=merge-duplicates" }) -Body $pb | Out-Null
    Write-Host "  profiles: role=$role OK" -ForegroundColor Green
  } catch {
    $m = $_.ErrorDetails.Message; if (-not $m) { $m = $_.Exception.Message }
    Write-Host "  profiles FAILED: $m" -ForegroundColor Yellow
  }
}

$fixed = @()
foreach ($r in $rows) {
  $pc = ("" + $r.Pdoce).Trim()
  if (-not $want.ContainsKey($pc)) { continue }
  $email = $r.Email.Trim().ToLower(); $pw = ("" + $r.password).Trim(); $role = $want[$pc]
  $nick = $r.("Nick Name").Trim()
  $ex = $users | Where-Object { $_.email -eq $email }
  if ($ex) {
    Write-Host "$pc $nick $email ALREADY EXISTS (id $($ex.id)) -> setting sheet password + confirming"
    $b = @{ password=$pw; email_confirm=$true } | ConvertTo-Json
    try {
      Invoke-RestMethod -Method Put -Uri "$URL/auth/v1/admin/users/$($ex.id)" -Headers $H -Body $b | Out-Null
      Write-Host "  password set to sheet value" -ForegroundColor Green
      Set-Profile $ex.id $role
      $fixed += @{ username=$email; password="__supabase__"; role=$role }
    } catch {
      $m = $_.ErrorDetails.Message; if (-not $m) { $m = $_.Exception.Message }
      Write-Host "  UPDATE FAILED: $m" -ForegroundColor Red
    }
  } else {
    Write-Host "$pc $nick $email NOT FOUND -> creating fresh"
    $b = @{ email=$email; password=$pw; email_confirm=$true; user_metadata=@{ name=$r.Admin.Trim() } } | ConvertTo-Json
    try {
      $u = Invoke-RestMethod -Method Post -Uri "$URL/auth/v1/admin/users" -Headers $H -Body $b
      Write-Host "  created" -ForegroundColor Green
      Set-Profile $u.id $role
      $fixed += @{ username=$email; password="__supabase__"; role=$role }
    } catch {
      $m = $_.ErrorDetails.Message; if (-not $m) { $m = $_.Exception.Message }
      Write-Host "  CREATE FAILED: $m" -ForegroundColor Red
    }
  }
}

# Marker's profiles row retry with real error surfaced
$mk = $users | Where-Object { $_.email -eq "chakrit.s@crea.asia" }
if ($mk) { Write-Host "`nMarker (chakrit.s, id $($mk.id)) profiles retry:"; Set-Profile $mk.id "cc" }
else { Write-Host "`nMarker not found in auth users?!" -ForegroundColor Red }

# Merge fixed users into app account list (kv nirm-userAccounts)
if ($fixed.Count -gt 0) {
  Write-Host "`nMerging $($fixed.Count) entries into app account list..."
  try {
    $row = Invoke-RestMethod -Method Get -Uri "$URL/rest/v1/kv_state?key=eq.nirm-userAccounts&select=key,value,version" -Headers $H
    $cur = $row[0].value; $ver = $row[0].version
    $wasString = $false; $list = @()
    if ($cur.PSObject.Properties["__wasString"]) { $wasString = $true; $list = @($cur.v) } else { $list = @($cur) }
    foreach ($e in $fixed) {
      $hit = $list | Where-Object { $_.username -and $_.username.ToLower() -eq $e.username.ToLower() }
      if ($hit) { $hit.role = $e.role }
      else { $list += [pscustomobject]$e }
    }
    if ($wasString) { $newVal = @{ __wasString = $true; v = $list } } else { $newVal = $list }
    $body = @{ value = $newVal; version = ($ver + 1) } | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Method Patch -Uri "$URL/rest/v1/kv_state?key=eq.nirm-userAccounts&version=eq.$ver" -Headers $H -Body $body | Out-Null
    Write-Host "App account list updated." -ForegroundColor Green
  } catch {
    Write-Host "kv merge failed: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
Write-Host "`nFix run complete."
