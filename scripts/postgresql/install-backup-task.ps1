<#
  Sets up the nightly backup. It registers a Windows scheduled task that runs backup-database.ps1 as
  SYSTEM every night at 11 PM. If the PC is off at 11 PM, the task runs as soon as it's next on.
  It also makes the backups folder, which only Administrators and SYSTEM may open.

  KVNsys Server's setup file runs this, and running it again replaces the task. Uninstalling removes
  the task and keeps the backups. It needs administrator rights, because a task that runs as SYSTEM
  does.
#>
param(
  [Parameter(Mandatory)] [string] $BackupScript,
  [string] $BackupDir = (Join-Path $env:ProgramData 'KVNsys\Backups'),
  [string] $At = '23:00',
  [string] $TaskName = 'KVNsys Nightly Backup',
  [string] $LogFile
)
$ErrorActionPreference = 'Stop'

function Write-Log([string] $line) {
  Write-Host $line
  if ($LogFile) { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 }
}

try {
  if ($LogFile) { Set-Content -LiteralPath $LogFile -Value "KVNsys nightly backup setup, $(Get-Date -Format s)" -Encoding UTF8 }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw 'This needs administrator rights: a task that runs as SYSTEM does.' }
  if (-not (Test-Path -LiteralPath $BackupScript -PathType Leaf)) { throw "There's no backup script at $BackupScript." }

  # The copies are the whole shop, so only Administrators and SYSTEM may open them. Written by SID,
  # so a Windows in another language works too.
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  & icacls $BackupDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Couldn't restrict who can open $BackupDir." }
  # Copies already there, from before a reinstall, take their permissions from the folder again.
  if (Get-ChildItem -LiteralPath $BackupDir -Force | Select-Object -First 1) {
    & icacls (Join-Path $BackupDir '*') /reset /T /C /Q | Out-Null
  }
  Write-Log "Only Administrators and SYSTEM can open $BackupDir."

  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$BackupScript`""
  $trigger = New-ScheduledTaskTrigger -Daily -At $At
  # StartWhenAvailable: a night missed with the PC off is made up soon after the PC starts. The
  # battery settings matter only on a laptop, and a backup takes seconds. An hour's limit means a
  # stuck run can't block the nights after it.
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Saves a copy of KVNsys's database to $BackupDir every night and keeps the newest 14. Installed by KVNsys Server Setup." `
    -Force | Out-Null
  Write-Log "The scheduled task '$TaskName' runs $BackupScript as SYSTEM every day at $At, or soon after the PC starts if it was off."
  exit 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  exit 1
}
