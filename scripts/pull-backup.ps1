# pull-backup.ps1 - weekly offsite copy of the prod DB to this PC. Runbook: docs/OPS_BACKUP_ALERTING.md.
# Streams the newest VERIFIED nightly (sqlite .backup + quick_check by rubli-backup-cron, named in
# LAST_BACKUP.json) through pigz over ssh, so nothing new is written on the VPS. Then verifies the copy
# (gzip CRC + exact size + SQLite header, verify-backup.py; -QuickCheck adds PRAGMA quick_check), keeps the last $Keep,
# logs to <Dest>\pull.log and pushes the result to the ntfy topic.
# Task (installed copy in D:\Python\RUBLI_ops): see docs/OPS_BACKUP_ALERTING.md section 1.
param(
  [string]$VpsHost   = $(if ($env:RUBLI_VPS) { $env:RUBLI_VPS } else { "root@rubli.xyz" }),
  [string]$Dest      = "D:\Python\RUBLI_backups",
  [int]$Keep         = 3,
  [string]$TopicFile = "D:\Python\yangwenli\.claude\ALERT_TOPIC.txt",
  [switch]$NoVerify,
  [switch]$QuickCheck   # + full PRAGMA quick_check on a temp copy (slow on the HDD; see verify-backup.py)
)
$ErrorActionPreference = "Stop"
$nightlyDir = "/var/lib/docker/volumes/rubli_rubli_backups/_data"
$ssh = "$env:SystemRoot\System32\OpenSSH\ssh.exe"
$log = Join-Path $Dest "pull.log"

function Log([string]$m) { $l = "$(Get-Date -Format s) $m"; Add-Content -Path $log -Value $l; Write-Host $l }
function Notify([string]$title, [string]$msg, [string]$prio) {
  try {
    $topic = (Get-Content $TopicFile -TotalCount 1).Trim()
    Invoke-RestMethod -Method Post -TimeoutSec 20 -Uri "https://ntfy.sh/$topic" -Body $msg `
      -Headers @{ Title = $title; Priority = $prio; Tags = "floppy_disk" } | Out-Null
  } catch { Log "ntfy push failed: $_" }
}

try {
  if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest | Out-Null }
  # private folder (umask 077 equivalent): drop inherited ACEs, only this user. The DB holds user emails.
  & icacls $Dest /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls failed on $Dest" }

  $meta = (& $ssh -o BatchMode=yes $VpsHost "cat /var/lib/rubli-db/LAST_BACKUP.json") | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or -not $meta) { throw "cannot read LAST_BACKUP.json on $VpsHost" }
  $name = [string]$meta.files[0]; $size = [int64]$meta.size_bytes
  if ($name -notmatch '^rubli_\d{8}_\d{6}\.db$') { throw "unexpected nightly name '$name'" }
  $target = Join-Path $Dest "$name.gz"
  if (Test-Path $target) { Log "SKIP: $name.gz already pulled"; exit 0 }

  $free = (Get-PSDrive ($Dest.Substring(0, 1))).Free
  if ($free -lt 2 * $size) { throw "only $([math]::Round($free / 1GB)) GB free on $($Dest.Substring(0, 2)) (need ~$([math]::Round(2 * $size / 1GB)) GB to pull + verify)" }

  Log "pulling $name ($([math]::Round($size / 1GB, 2)) GB raw) from $VpsHost, $([math]::Round($free / 1GB)) GB free"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  # cmd's > is byte-exact (Windows PowerShell 5.1 redirection would re-encode the gzip stream as text).
  # nice/ionice + 2 pigz threads: prod keeps serving while this reads 8+ GB.
  $remote = "nice -n 19 ionice -c3 pigz -c -p 2 $nightlyDir/$name"
  & cmd /c "`"$ssh`" -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=20 $VpsHost `"$remote`" > `"$target.part`""
  if ($LASTEXITCODE -ne 0) { Remove-Item "$target.part" -ErrorAction SilentlyContinue; throw "ssh/pigz exited $LASTEXITCODE" }
  $gz = (Get-Item "$target.part").Length
  Log "transferred $([math]::Round($gz / 1GB, 2)) GB gz in $([math]::Round($sw.Elapsed.TotalMinutes, 1)) min"

  if (-not $NoVerify) {
    $py = (Get-Command python -ErrorAction Stop).Source
    $out = & $py -I (Join-Path $PSScriptRoot "verify-backup.py") "$target.part" $size $(if ($QuickCheck) { "--quick-check" })
    if ($LASTEXITCODE -ne 0) { Remove-Item "$target.part"; throw "verify failed: $out" }
    Log "verified: $out"
  }
  Move-Item -Force "$target.part" $target

  Get-ChildItem $Dest -Filter "rubli_*.db.gz" | Sort-Object Name -Descending | Select-Object -Skip $Keep |
    ForEach-Object { Log "rotating out $($_.Name)"; Remove-Item $_.FullName }
  $msg = "$name.gz $([math]::Round($gz / 1GB, 2)) GB in $([math]::Round($sw.Elapsed.TotalMinutes, 1)) min, verified"
  Log "OK: $msg"
  Notify "RUBLI backup pulled" $msg "low"
} catch {
  Log "FAILED: $_"
  Notify "RUBLI backup pull FAILED" "$_" "high"
  exit 1
}
