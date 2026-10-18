<#
  Saves a copy of KVNsys's database: the nightly backup. KVNsys Server's setup file installs this
  beside the server, and a Windows scheduled task runs it every night (see install-backup-task.ps1).
  From an administrator PowerShell, it also makes a copy on the spot.

  Each copy is one file, kvnsys-<date>-<time>.dump, in PostgreSQL's own compressed format, and
  check-backup.ps1 proves one can be put back. A new copy is read back in full before it counts.
  Only then are copies beyond the newest 14 deleted, so a run of failed nights never costs the
  copies that work.

  It signs in the way KVNsys Server does, with the DATABASE_URL in the server's settings: as the
  database's owner, which can read all of it and do nothing else on the PC's PostgreSQL.

  Example, from an administrator PowerShell:
    & 'C:\Program Files\KVNsys\Server\setup\backup-database.ps1'
#>
param(
  [string] $ServerSettingsFile = (Join-Path $env:ProgramData 'KVNsys\Server\server.env'),
  [string] $BackupDir = (Join-Path $env:ProgramData 'KVNsys\Backups'),
  [string] $InstallDir = (Join-Path $env:ProgramFiles 'KVNsys\PostgreSQL\18'),
  [ValidateRange(1, 1000)] [int] $Keep = 14,
  [string] $LogFile = (Join-Path $env:ProgramData 'KVNsys\Logs\backup.log')
)
$ErrorActionPreference = 'Stop'
$secrets = New-Object System.Collections.Generic.List[string]
# Only files named exactly like this are ever deleted.
$copyPattern = '^kvnsys-\d{4}-\d{2}-\d{2}-\d{6}\.dump$'
$partialPattern = '^kvnsys-\d{4}-\d{2}-\d{2}-\d{6}\.dump\.partial$'

function Write-Log([string] $line) {
  foreach ($secret in $secrets) { $line = $line.Replace($secret, '****') }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $line"
  # Write-Host, not Write-Output, so a function that returns something can still log.
  Write-Host $line
  # A log that can't be written mustn't stop the backup.
  if ($LogFile) { try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch { } }
}

# Runs one of PostgreSQL's programs, logs what it says, and stops if it fails.
function Invoke-Tool([string] $program, [string[]] $arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $program @arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  foreach ($line in $output) { Write-Log "    $line" }
  if ($code -ne 0) { throw "$(Split-Path $program -Leaf) failed (exit code $code)." }
}

# Where KVNsys Server's database is, and how it signs in: its settings file's DATABASE_URL line.
function Read-DatabaseUrl([string] $file) {
  try {
    $lines = Get-Content -LiteralPath $file
  } catch {
    throw "Can't read KVNsys Server's settings, $file. Run this as administrator."
  }
  $line = $lines | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
  if (-not $line) { throw "There's no DATABASE_URL in $file." }
  $value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim([char[]] @('"', "'"))
  $uri = [Uri] $value
  $credentials = $uri.UserInfo -split ':', 2
  if ($credentials.Count -lt 2) { throw "The DATABASE_URL in $file has no password." }
  $port = 5432
  if ($uri.Port -gt 0) { $port = $uri.Port }
  return @{
    Host = $uri.DnsSafeHost
    Port = $port
    User = [Uri]::UnescapeDataString($credentials[0])
    Password = [Uri]::UnescapeDataString($credentials[1])
    Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  }
}

function Format-Size([long] $bytes) {
  if ($bytes -ge 1MB) { return '{0:N1} MB' -f ($bytes / 1MB) }
  return '{0:N0} KB' -f [Math]::Ceiling($bytes / 1KB)
}

$started = Get-Date
$partial = $null
try {
  if ($LogFile) { New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null }
  $bin = Join-Path $InstallDir 'bin'
  if (-not (Test-Path (Join-Path $bin 'pg_dump.exe'))) { throw "There's no pg_dump.exe in $bin." }
  $db = Read-DatabaseUrl $ServerSettingsFile
  if ($db.Password) { $secrets.Add($db.Password) }

  # The setup makes the folder. If it has gone, it comes back as the setup makes it: the copies are
  # the whole shop, so only Administrators and SYSTEM may open them.
  if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    & icacls $BackupDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Couldn't restrict who can open $BackupDir." }
  }

  # After a night with the PC off, Windows runs this soon after startup, maybe before PostgreSQL
  # is up. So it waits for the database, up to five minutes.
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    & (Join-Path $bin 'pg_isready.exe') -h $db.Host -p $db.Port -q
    $ready = $LASTEXITCODE -eq 0
    if (-not $ready) { Start-Sleep -Seconds 10 }
  }
  if (-not $ready) { throw "The database isn't answering on port $($db.Port). Is the KVNsys PostgreSQL service running?" }

  $name = "kvnsys-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').dump"
  $copy = Join-Path $BackupDir $name
  $partial = "$copy.partial"
  $env:PGPASSWORD = $db.Password
  try {
    Invoke-Tool (Join-Path $bin 'pg_dump.exe') @(
      '-h', $db.Host, '-p', "$($db.Port)", '-U', $db.User, '-d', $db.Database,
      '--format=custom', '--no-password', "--file=$partial")
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  # Read all of it back before it counts, so a copy cut short by a full disk or a power cut never
  # stands in for one that works. Nothing is written: the output goes to NUL.
  Invoke-Tool (Join-Path $bin 'pg_restore.exe') @('--file=NUL', $partial)
  Move-Item -LiteralPath $partial -Destination $copy
  $partial = $null

  # Keep the newest copies. The one just made always stays, even if the PC's clock has gone wrong
  # and its name sorts as the oldest.
  $others = @(Get-ChildItem -LiteralPath $BackupDir -File |
    Where-Object { $_.Name -match $copyPattern -and $_.Name -ne $name } |
    Sort-Object Name -Descending)
  $old = @($others | Select-Object -Skip ($Keep - 1))
  foreach ($file in $old) { Remove-Item -LiteralPath $file.FullName -Force }
  # Leftovers from a run that was cut off part-way.
  Get-ChildItem -LiteralPath $BackupDir -File | Where-Object { $_.Name -match $partialPattern } | Remove-Item -Force

  $kept = [Math]::Min($others.Count, $Keep - 1) + 1
  $seconds = [int] ((Get-Date) - $started).TotalSeconds
  $summary = "Saved $name ($(Format-Size (Get-Item -LiteralPath $copy).Length), $seconds s). "
  if ($kept -eq 1) { $summary += '1 copy kept' } else { $summary += "$kept copies kept" }
  if ($old.Count -gt 0) { $summary += ", $($old.Count) older deleted" }
  Write-Log "$summary."
  if ($others.Count -gt 0 -and $others[0].Name -gt $name) {
    Write-Log "Note: $($others[0].Name) is dated later than this copy. Is this PC's date and time right?"
  }
  exit 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  if ($partial) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
  exit 1
}
