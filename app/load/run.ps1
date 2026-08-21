param(
  [ValidateSet("baseline", "limit", "batch", "inbound", "sustained", "starter-burst", "burst", "noisy-neighbor", "failure", "recovery")]
  [string]$Profile = "baseline",
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,
  [string]$ApiKey,
  [string]$ApplicationId,
  [string]$ControlApiKey,
  [string]$ControlApplicationId,
  [string]$EndpointId,
  [switch]$IsolatedProject,
  [string]$Approval,
  [int]$MaxEvents = 10000,
  [string]$EvidenceDatabaseUrl,
  [int]$EvidenceWaitSeconds = 0
)

$ErrorActionPreference = "Stop"
if (-not $IsolatedProject) { throw "Use an isolated load-test project and pass -IsolatedProject." }
if ($Approval -ne "I_APPROVE_LOAD_TEST") { throw "Pass -Approval I_APPROVE_LOAD_TEST after reviewing the target and event budget." }
if ($BaseUrl -notmatch '^https://') { throw "BaseUrl must use HTTPS." }

$config = switch ($Profile) {
  "baseline" { @{ Rate = 2; Duration = "2m"; BatchSize = 1; Script = "messages.js" } }
  "limit" { @{ Rate = 5; Duration = "2m"; BatchSize = 1; Script = "messages.js" } }
  "batch" { @{ Rate = 2; Duration = "1m"; BatchSize = 25; Script = "batch.js" } }
  "inbound" { @{ Rate = 2; Duration = "2m"; BatchSize = 1; Script = "inbound.js" } }
  "sustained" { @{ Rate = 10; Duration = "10m"; BatchSize = 1; Script = "messages.js" } }
  # A plan-aware burst that remains below Starter's 1,000 requests/minute
  # while still exercising concurrent acceptance.
  "starter-burst" { @{ Rate = 15; Duration = "2m"; BatchSize = 1; Script = "burst.js"; EstimatedEvents = 960 } }
  # burst.js ramps 5/s -> 50/s -> 5/s over two minutes. Its staged
  # arrival-rate area schedules approximately 3,300 iterations.
  "burst" { @{ Rate = 50; Duration = "2m"; BatchSize = 1; Script = "burst.js"; EstimatedEvents = 3300 } }
  # Starter-safe two-tenant isolation test: a 15/s noisy tenant runs beside
  # a steady 2/s control tenant. Each tenant uses a separate workspace key.
  "noisy-neighbor" { @{ Rate = 15; ControlRate = 2; Duration = "2m"; BatchSize = 1; Script = "noisy-neighbor.js"; EstimatedEvents = 1200 } }
  "failure" { @{ Rate = 5; Duration = "2m"; BatchSize = 1; Script = "messages.js" } }
  "recovery" { @{ Rate = 5; Duration = "2m"; BatchSize = 1; Script = "messages.js" } }
}

if ($Profile -eq "inbound") {
  if ($EndpointId -notmatch '^[0-9a-fA-F-]{36}$') { throw "EndpointId must be a UUID for the inbound profile." }
} else {
  if ($ApiKey -notmatch '^pg_[A-Za-z0-9_-]+') { throw "ApiKey does not look like a PayloadGrid key." }
  if ($ApplicationId -notmatch '^[0-9a-fA-F-]{36}$') { throw "ApplicationId must be a UUID." }
}
if ($Profile -eq "noisy-neighbor") {
  if ($ControlApiKey -notmatch '^pg_[A-Za-z0-9_-]+') { throw "ControlApiKey does not look like a PayloadGrid key." }
  if ($ControlApplicationId -notmatch '^[0-9a-fA-F-]{36}$') { throw "ControlApplicationId must be a UUID." }
  if ($ApiKey -eq $ControlApiKey) { throw "Noisy and control tenants must use different API keys." }
  if ($ApplicationId -eq $ControlApplicationId) { throw "Noisy and control tenants must use different applications." }
}

function DurationSeconds([string]$Value) {
  if ($Value -match '^(\d+)s$') { return [int]$Matches[1] }
  if ($Value -match '^(\d+)m$') { return [int]$Matches[1] * 60 }
  throw "Unsupported duration: $Value"
}

$estimatedEvents = if ($config.ContainsKey("EstimatedEvents")) {
  [int]$config.EstimatedEvents
} else {
  $config.Rate * (DurationSeconds $config.Duration) * $config.BatchSize
}
if ($estimatedEvents -gt $MaxEvents) {
  throw "Profile would send approximately $estimatedEvents events, above MaxEvents=$MaxEvents."
}

$k6 = Get-Command k6 -ErrorAction SilentlyContinue
$k6Path = if ($k6) { $k6.Source } else { "C:\Program Files\k6\k6.exe" }
if (-not (Test-Path -LiteralPath $k6Path)) { throw "k6 is not installed." }

$results = Join-Path $PSScriptRoot "results"
New-Item -ItemType Directory -Path $results -Force | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmssZ")
$prefix = Join-Path $results "$stamp-$Profile"
$summary = "$prefix-summary.json"
$console = "$prefix-console.txt"
$metadata = "$prefix-metadata.json"
$evidence = "$prefix-delivery-evidence.json"
$script = Join-Path $PSScriptRoot "k6\$($config.Script)"
$runId = "load-$stamp-$Profile"

@{
  profile = $Profile
  baseUrl = $BaseUrl.TrimEnd("/")
  applicationId = $ApplicationId
  controlApplicationId = $ControlApplicationId
  endpointId = $EndpointId
  ratePerSecond = $config.Rate
  controlRatePerSecond = if ($config.ContainsKey("ControlRate")) { $config.ControlRate } else { $null }
  duration = $config.Duration
  batchSize = $config.BatchSize
  estimatedEvents = $estimatedEvents
  runId = $runId
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $metadata

$env:BASE_URL = $BaseUrl.TrimEnd("/")
$env:API_KEY = $ApiKey
$env:APPLICATION_ID = $ApplicationId
$env:CONTROL_API_KEY = $ControlApiKey
$env:CONTROL_APPLICATION_ID = $ControlApplicationId
$env:ENDPOINT_ID = $EndpointId
$env:RATE = [string]$config.Rate
$env:CONTROL_RATE = if ($config.ContainsKey("ControlRate")) { [string]$config.ControlRate } else { "" }
$env:DURATION = $config.Duration
$env:BATCH_SIZE = [string]$config.BatchSize
$env:LOAD_RUN_ID = $runId
$env:LOAD_SCENARIO = $Profile

$exitCode = 1
$previousErrorActionPreference = $ErrorActionPreference
try {
  # k6 writes threshold failures to stderr. Preserve its exit code without
  # turning a completed test into a terminating PowerShell NativeCommandError.
  $ErrorActionPreference = "Continue"
  & $k6Path run --summary-export $summary $script 2>&1 | Tee-Object -FilePath $console
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
  Remove-Item Env:API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:APPLICATION_ID -ErrorAction SilentlyContinue
  Remove-Item Env:CONTROL_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:CONTROL_APPLICATION_ID -ErrorAction SilentlyContinue
  Remove-Item Env:ENDPOINT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:RATE -ErrorAction SilentlyContinue
  Remove-Item Env:CONTROL_RATE -ErrorAction SilentlyContinue
  Remove-Item Env:DURATION -ErrorAction SilentlyContinue
  Remove-Item Env:BATCH_SIZE -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_RUN_ID -ErrorAction SilentlyContinue
  Remove-Item Env:LOAD_SCENARIO -ErrorAction SilentlyContinue
}

if ($EvidenceDatabaseUrl -and $exitCode -eq 0) {
  if ($EvidenceWaitSeconds -gt 0) { Start-Sleep -Seconds $EvidenceWaitSeconds }
  $env:LOAD_EVIDENCE_DATABASE_URL = $EvidenceDatabaseUrl
  $env:LOAD_RUN_ID = $runId
  $env:LOAD_EVIDENCE_FILE = $evidence
  try { node (Join-Path $PSScriptRoot "evidence.mjs") }
  finally {
    Remove-Item Env:LOAD_EVIDENCE_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:LOAD_RUN_ID -ErrorAction SilentlyContinue
    Remove-Item Env:LOAD_EVIDENCE_FILE -ErrorAction SilentlyContinue
  }
}

Write-Host "Recorded summary: $summary"
Write-Host "Recorded console: $console"
Write-Host "Recorded metadata: $metadata"
if (Test-Path -LiteralPath $evidence) { Write-Host "Recorded delivery evidence: $evidence" }
if ($exitCode -ne 0) { Write-Warning "k6 completed with failed thresholds (exit code $exitCode). Review the recorded summary and failure samples." }
exit $exitCode
