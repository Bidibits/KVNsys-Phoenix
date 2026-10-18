<#
  Checks that a backup can really be put back. It restores one into a throwaway database on this
  PC's KVNsys PostgreSQL, compares every table with the live database, then removes the throwaway
  database. The live database is only read, never written.

  Creating a database takes PostgreSQL's own administrator account (postgres), so it signs in with
  the password KVNsys Server's setup stored for this PC. That's why it needs administrator rights.

  Examples, from an administrator PowerShell:
    & 'C:\Program Files\KVNsys\Server\setup\check-backup.ps1'     # checks the newest backup
    & 'C:\Program Files\KVNsys\Server\setup\check-backup.ps1' -BackupFile C:\ProgramData\KVNsys\Backups\<file>.dump
#>
param(
  # Which backup. Leave it out for the newest one in BackupDir.
  [string] $BackupFile,
  [string] $BackupDir = (Join-Path $env:ProgramData 'KVNsys\Backups'),
  [string] $ServerSettingsFile = (Join-Path $env:ProgramData 'KVNsys\Server\server.env'),
  [string] $SuperuserPasswordFile = (Join-Path $env:ProgramData 'KVNsys\PostgreSQL\superuser.dpapi'),
  [string] $Superuser = 'postgres',
  [string] $InstallDir = (Join-Path $env:ProgramFiles 'KVNsys\PostgreSQL\18'),
  # Made, filled, compared and dropped again by this script. One already called this is replaced.
  [string] $CheckDatabase = 'kvnsys_backup_check',
  # Fail unless every table matches: for a test, where nothing changes between the copy and the check.
  [switch] $RequireMatch,
  [string] $LogFile
)
$ErrorActionPreference = 'Stop'
$secrets = New-Object System.Collections.Generic.List[string]

function Write-Log([string] $line) {
  foreach ($secret in $secrets) { $line = $line.Replace($secret, '****') }
  # Write-Host, not Write-Output, so a function that returns something can still log.
  Write-Host $line
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

# Runs SQL through psql as the administrator account, and returns the rows: one line each, columns
# split by |. The SQL goes in through psql's input, so no quote is ever mangled on a command line.
function Invoke-Query([string] $database, [string] $sql) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = $sql | & $psql -h $db.Host -p $db.Port -U $Superuser -d $database -X -A -t -q --no-password -v ON_ERROR_STOP=1 -f - 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  foreach ($line in @($output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })) { Write-Log "    $line" }
  if ($code -ne 0) { throw "psql failed in the database $database (exit code $code)." }
  return @($output | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" })
}

# Where KVNsys Server's database is: its settings file's DATABASE_URL line.
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
  $port = 5432
  if ($uri.Port -gt 0) { $port = $uri.Port }
  return @{
    Host = $uri.DnsSafeHost
    Port = $port
    Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  }
}

# One entry per table: its rows, and a fingerprint that changes if any value in any row does.
function Get-Tables([string] $database) {
  $queries = @(Invoke-Query $database @"
SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(md5(x::text), '''' ORDER BY md5(x::text)), '''')) FROM public.%I x', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
"@)
  $tables = @{}
  if ($queries.Count -eq 0) { return $tables }
  foreach ($row in @(Invoke-Query $database (($queries -join "`nUNION ALL`n") + ';'))) {
    $parts = $row -split '\|'
    $tables[$parts[0]] = @{ Rows = $parts[1]; Fingerprint = $parts[2] }
  }
  return $tables
}

function Format-Size([long] $bytes) {
  if ($bytes -ge 1MB) { return '{0:N1} MB' -f ($bytes / 1MB) }
  return '{0:N0} KB' -f [Math]::Ceiling($bytes / 1KB)
}

$exitCode = 1
$throwawayMade = $false
try {
  if ($LogFile) { Set-Content -LiteralPath $LogFile -Value "KVNsys backup check, $(Get-Date -Format s)" -Encoding UTF8 }
  $bin = Join-Path $InstallDir 'bin'
  $psql = Join-Path $bin 'psql.exe'
  if (-not (Test-Path $psql)) { throw "There are no PostgreSQL programs in $bin." }
  if ($CheckDatabase -notmatch '^[a-z_][a-z0-9_]*$') { throw "The throwaway database's name has to be plain lowercase letters, digits and _." }
  # Quietly: "it wasn't there" isn't news.
  $dropThrowaway = "SET client_min_messages = warning; DROP DATABASE IF EXISTS $CheckDatabase WITH (FORCE);"

  if (-not $BackupFile) {
    $newest = Get-ChildItem -LiteralPath $BackupDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^kvnsys-\d{4}-\d{2}-\d{2}-\d{6}\.dump$' } |
      Sort-Object Name -Descending | Select-Object -First 1
    if (-not $newest) { throw "There are no backups in $BackupDir yet." }
    $BackupFile = $newest.FullName
  }
  if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "There's no backup file $BackupFile." }
  $backup = Get-Item -LiteralPath $BackupFile
  Write-Log "Checking $($backup.Name) ($(Format-Size $backup.Length), saved $($backup.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))"

  $db = Read-DatabaseUrl $ServerSettingsFile
  if ($CheckDatabase -eq $db.Database) { throw "The throwaway database can't have the live database's name." }
  try {
    $protected = [IO.File]::ReadAllBytes($SuperuserPasswordFile)
  } catch {
    throw "Can't read the stored PostgreSQL password, $SuperuserPasswordFile. Run this as administrator."
  }
  Add-Type -AssemblyName System.Security
  $superuserPassword = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($protected, $null, 'LocalMachine'))
  if ($superuserPassword) { $secrets.Add($superuserPassword) }
  $env:PGPASSWORD = $superuserPassword

  # 1. An empty throwaway database.
  Invoke-Query 'postgres' $dropThrowaway | Out-Null
  Invoke-Query 'postgres' "CREATE DATABASE $CheckDatabase;" | Out-Null
  $throwawayMade = $true

  # 2. The backup, put back into it. Any error stops the restore, so "restored" means all of it.
  Invoke-Tool (Join-Path $bin 'pg_restore.exe') @(
    '-h', $db.Host, '-p', "$($db.Port)", '-U', $Superuser, '-d', $CheckDatabase,
    '--exit-on-error', '--no-password', $BackupFile)
  Write-Log '  It restored without an error, into a throwaway database.'

  # 3. It's KVNsys's: it carries the record of KVNsys's database updates.
  $restored = Get-Tables $CheckDatabase
  if (-not $restored.ContainsKey('_prisma_migrations')) {
    throw "It restored, but it isn't a KVNsys database: there's no record of KVNsys's database updates in it."
  }
  $rowCount = 0
  foreach ($table in $restored.Values) { $rowCount += [long] $table.Rows }
  Write-Log "  It holds $($restored.Count) tables and $rowCount rows."

  # 4. Every table against the live database, row by row.
  $live = Get-Tables $db.Database
  $names = @(@($restored.Keys) + @($live.Keys) | Sort-Object -Unique)
  $differences = New-Object System.Collections.Generic.List[string]
  foreach ($name in $names) {
    if (-not $live.ContainsKey($name)) { $differences.Add("$name is in the backup, not in the live database"); continue }
    if (-not $restored.ContainsKey($name)) { $differences.Add("$name is in the live database, not in the backup"); continue }
    $then = $restored[$name]
    $now = $live[$name]
    if ($then.Fingerprint -ne $now.Fingerprint) {
      $differences.Add("$name differs: $($then.Rows) rows in the backup, $($now.Rows) in the live database")
    }
  }
  if ($differences.Count -eq 0) {
    Write-Log '  Every table matches the live database, row for row.'
  } else {
    Write-Log "  $($differences.Count) of $($names.Count) tables differ from the live database:"
    foreach ($line in $differences) { Write-Log "    $line" }
    if ($RequireMatch) { throw 'Every table had to match the live database.' }
    Write-Log "  That's expected when the shop has used KVNsys since the backup was made."
  }
  $exitCode = 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
} finally {
  if ($throwawayMade) {
    try {
      Invoke-Query 'postgres' $dropThrowaway | Out-Null
      Write-Log '  The throwaway database is removed again.'
    } catch {
      Write-Log "  Couldn't remove the throwaway database, $CheckDatabase. Running this again replaces it."
    }
  }
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
if ($exitCode -eq 0) { Write-Log 'The backup is good: it can be put back.' }
exit $exitCode
