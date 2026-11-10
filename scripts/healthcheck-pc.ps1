# healthcheck-pc.ps1 - every 10 min from this PC (Task RUBLI-healthcheck). Runbook: docs/OPS_BACKUP_ALERTING.md.
# Same public check as the VPS cron (scripts/uptime-check.sh), from outside, so a dead VPS still alerts.
# 2 failures in a row (~20 min) -> ntfy push, repeated hourly while down; one "recovered" push after.
# If this PC itself is offline (ntfy.sh unreachable too) the round is skipped, not counted.
param(
  [string]$Url       = "https://rubli.xyz/api/v1/health",
  [string]$TopicFile = "D:\Python\yangwenli\.claude\ALERT_TOPIC.txt",
  [string]$State     = "D:\Python\RUBLI_ops\state"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $State | Out-Null
$failsF = Join-Path $State "fails"; $downF = Join-Path $State "down"
$topic = (Get-Content $TopicFile -TotalCount 1).Trim()

function Notify([string]$title, [string]$msg, [string]$prio) {
  try {
    Invoke-RestMethod -Method Post -TimeoutSec 20 -Uri "https://ntfy.sh/$topic" -Body $msg `
      -Headers @{ Title = $title; Priority = $prio; Tags = "rotating_light" } | Out-Null
  } catch { }
}

$err = ""
try {
  $r = Invoke-RestMethod -TimeoutSec 30 -Uri $Url
  $ok = ($r.status -eq "ok") -and ($r.db_connected -eq $true)
  if (-not $ok) { $err = "status=$($r.status) db_connected=$($r.db_connected)" }
} catch { $ok = $false; $err = $_.Exception.Message }

if ($ok) {
  if (Test-Path $downF) {
    Notify "RUBLI recovered (seen from PC)" "$Url healthy again (down since $(Get-Content $downF))" "default"
    Remove-Item $downF
  }
  Set-Content $failsF 0
  exit 0
}

try { Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 15 -Uri "https://ntfy.sh" | Out-Null } catch { exit 0 }

$fails = 1 + [int](Get-Content $failsF -ErrorAction SilentlyContinue)
Set-Content $failsF $fails
if ($fails -ge 2 -and (($fails - 2) % 6) -eq 0) {
  if (-not (Test-Path $downF)) { Set-Content $downF (Get-Date).ToUniversalTime().ToString("s") }
  Notify "RUBLI DOWN (seen from PC)" "$Url failed $fails checks in a row (~$($fails * 10) min): $err" "urgent"
}
exit 1
