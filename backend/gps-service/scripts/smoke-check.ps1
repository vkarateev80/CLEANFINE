# Smoke check for gps-service (M3.1 / M3.2) against a running dev stand.
#
# Flow: login to auth-service -> create geofence -> send batch inside the geofence
# (no event) -> bind a temporary RabbitMQ queue -> send batch outside the geofence
# (must emit geofence.exit) -> read the event from the queue -> check geofence
# containment, nearby employees and track history.
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 scripts as ANSI.
#
#   powershell -NoProfile -File backend/gps-service/scripts/smoke-check.ps1
#
param(
  [string]$AuthUrl = 'http://localhost:3001',
  [string]$GpsUrl = 'http://localhost:3004',
  [string]$Email = 'admin@cleaning-ops.com',
  [string]$Password = 'admin123',
  [string]$PostgresContainer = 'cleaning-ops-postgres',
  [string]$RabbitContainer = 'cleaning-ops-rabbitmq',
  [string]$Exchange = 'cleaning-ops.events',
  [string]$RoutingKey = 'geofence.exit'
)

$ErrorActionPreference = 'Stop'
$script:failures = 0

# Management API credentials for rabbitmqadmin are taken from the root .env
# (RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD) - no secrets in this file.
function Get-RootEnvValue([string]$name) {
  $envPath = Join-Path $PSScriptRoot '..\..\..\.env'
  if (-not (Test-Path $envPath)) { return '' }
  $line = Get-Content $envPath | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return ($line -replace "^$name=", '').Trim()
}

function Invoke-RabbitAdmin([string[]]$AdminArgs) {
  $user = Get-RootEnvValue 'RABBITMQ_DEFAULT_USER'
  $pass = Get-RootEnvValue 'RABBITMQ_PASSWORD'
  if (-not $pass) { $pass = Get-RootEnvValue 'RABBITMQ_DEFAULT_PASSWORD' }
  if (-not $user -or -not $pass) {
    # Empty credentials make rabbitmqadmin misparse arguments ("Action ... not understood").
    throw 'RABBITMQ_DEFAULT_USER / RABBITMQ_PASSWORD not found in the root .env'
  }
  # Windows PowerShell 5.1 turns native stderr into an ErrorRecord; with
  # $ErrorActionPreference='Stop' that would abort the script, so relax it here.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    return (docker exec $RabbitContainer rabbitmqadmin -u $user -p $pass @AdminArgs 2>&1 | Out-String)
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Write-Step([string]$name, [string]$value) {
  Write-Host ("  {0}: {1}" -f $name, $value)
}

function Assert-True([string]$label, [bool]$condition, [string]$details = '') {
  if ($condition) {
    Write-Host ("PASS  {0} {1}" -f $label, $details)
  } else {
    $script:failures++
    Write-Host ("FAIL  {0} {1}" -f $label, $details)
  }
}

function Invoke-Json([string]$Method, [string]$Url, $Body = $null, [string]$Token = '') {
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  $params = @{ Method = $Method; Uri = $Url; Headers = $headers; TimeoutSec = 30 }
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($json)
    $params['ContentType'] = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

function Get-JwtSubject([string]$Token) {
  $payload = $Token.Split('.')[1].Replace('-', '+').Replace('_', '/')
  switch ($payload.Length % 4) {
    2 { $payload += '==' }
    3 { $payload += '=' }
  }
  $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
  return ($decoded | ConvertFrom-Json).sub
}

Write-Host '== gps-service smoke check =='

# 1. Auth (shared JWT_ACCESS_SECRET with gps-service).
$login = Invoke-Json -Method Post -Url "$AuthUrl/api/auth/login" -Body @{ email = $Email; password = $Password }
$token = $login.accessToken
$userId = Get-JwtSubject $token
Write-Step 'token' 'received'
Write-Step 'userId' $userId

# 2. Geofence around 55.7558 / 37.6173 (Moscow, ~160x200 m box).
$objectId = '3f1a5f9e-9a1e-4c6d-9a1e-000000000001'
$boundary = @{
  type        = 'Polygon'
  coordinates = @(, @(
    , @(37.6170, 55.7555)
    , @(37.6190, 55.7555)
    , @(37.6190, 55.7570)
    , @(37.6170, 55.7570)
    , @(37.6170, 55.7555)
  ))
}
$geofence = Invoke-Json -Method Post -Url "$GpsUrl/api/gps/geofences" -Token $token -Body @{
  objectId     = $objectId
  name         = 'Smoke test object'
  radiusMeters = 100
  boundary     = $boundary
}
Write-Step 'geofenceId' $geofence.id
Assert-True 'geofence created' ($null -ne $geofence.id)

# 3. Batch INSIDE the geofence: no geofence.exit expected.
$inside = Invoke-Json -Method Post -Url "$GpsUrl/api/gps/track" -Token $token -Body @{
  employeeName = 'Admin Test'
  tracks       = @(
    @{ lat = 55.7560; lng = 37.6180; accuracy = 4.5; speed = 1.2; battery = 88 }
    @{ lat = 55.7562; lng = 37.6182; accuracy = 5.0; speed = 0.0; battery = 87 }
  )
}
Write-Step 'accepted (inside)' $inside.accepted
Assert-True 'batch accepted' ($inside.accepted -eq 2)
Assert-True 'no exit event while inside' ($inside.geofenceExits.Count -eq 0)

# 4. Temporary queue to capture geofence.exit.
Invoke-RabbitAdmin @('declare', 'queue', 'name=gps.smoke.geofence', 'durable=false') | Out-Null
Invoke-RabbitAdmin @('declare', 'binding', "source=$Exchange", 'destination=gps.smoke.geofence', "routing_key=$RoutingKey") | Out-Null

# 5. Batch OUTSIDE the geofence: geofence.exit expected.
$outside = Invoke-Json -Method Post -Url "$GpsUrl/api/gps/track" -Token $token -Body @{
  employeeName = 'Admin Test'
  tracks       = @(@{ lat = 55.7000; lng = 37.5000; accuracy = 8.0; battery = 80 })
}
Write-Step 'accepted (outside)' $outside.accepted
Assert-True 'exit event emitted' ($outside.geofenceExits.Count -eq 1) ("count=" + $outside.geofenceExits.Count)
Assert-True 'exit published to RabbitMQ' ($outside.geofenceExits[0].published -eq $true)
Assert-True 'exit references the geofence' ($outside.geofenceExits[0].geofenceId -eq $geofence.id)

# 6. Read the event back from RabbitMQ (proves the exchange/routing key).
$raw = Invoke-RabbitAdmin @('get', 'queue=gps.smoke.geofence', 'ackmode=ack_requeue_false')
$message = [regex]::Match($raw, '\{[^{}]*"userId"[^{}]*\}')
Write-Step 'rabbit payload' $message.Value
Assert-True 'RabbitMQ message received' $message.Success
Assert-True 'contract fields present' (($message.Value -match 'employeeName') -and ($message.Value -match 'objectId') -and ($message.Value -match 'timestamp'))
Assert-True 'routing key is geofence.exit' ($raw -match 'geofence\.exit')
Invoke-RabbitAdmin @('delete', 'queue', 'name=gps.smoke.geofence') | Out-Null

# 7. Geofence containment check (SQL item 3).
$check = Invoke-Json -Method Get -Url "$GpsUrl/api/gps/geofences/$userId/check?lat=55.7560&lng=37.6180" -Token $token
Write-Step 'inside' $check.inside
Write-Step 'distanceMeters' $check.distanceMeters
Assert-True 'ST_Contains reports inside' ($check.inside -eq $true)
Assert-True 'nearest geofence returned' ($null -ne $check.geofence)

# 8. Nearby employees (SQL item 4: last point not older than 5 minutes).
$nearby = Invoke-Json -Method Get -Url "$GpsUrl/api/gps/employees/nearby?lat=55.7000&lng=37.5000&radius=2000" -Token $token
Write-Step 'nearby count' $nearby.count
$self = $nearby.employees | Where-Object { $_.userId -eq $userId } | Select-Object -First 1
Assert-True 'nearby finds the sender' ($null -ne $self)
if ($self) { Write-Step 'nearby distanceMeters' $self.distanceMeters }

# 9. Track history.
$history = Invoke-Json -Method Get -Url "$GpsUrl/api/gps/tracks?userId=$userId&limit=100" -Token $token
Write-Step 'history count' $history.count
Assert-True 'history returns tracks' ($history.count -ge 3)
Assert-True 'history has coordinates' ($history.tracks[0].lat -ne $null)

# 10. RBAC: reading without a token must be rejected by the global JwtAuthGuard.
try {
  Invoke-Json -Method Get -Url "$GpsUrl/api/gps/tracks?userId=$userId" | Out-Null
  Assert-True 'unauthenticated read rejected' $false
} catch {
  Assert-True 'unauthenticated read rejected' ($_.Exception.Response.StatusCode.value__ -eq 401)
}

# 11. Database sanity: PostGIS extension, GIST indexes, stored points.
$dbCheck = docker exec $PostgresContainer psql -U admin -d cleaning_ops_gps -t -A -c "SELECT (SELECT count(*) FROM gps_tracks), (SELECT count(*) FROM geofences), (SELECT count(*) FROM pg_indexes WHERE indexdef ILIKE '%USING gist%');"
Write-Step 'db (tracks, geofences, gist indexes)' $dbCheck.Trim()

Write-Host ''
if ($script:failures -eq 0) {
  Write-Host 'RESULT: all smoke checks passed'
} else {
  Write-Host ("RESULT: {0} check(s) failed" -f $script:failures)
  exit 1
}
