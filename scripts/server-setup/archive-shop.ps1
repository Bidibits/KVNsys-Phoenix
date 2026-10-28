<#
  Packs a server PC's shop into one archive file. Uninstalling KVNsys Server runs this first, so the
  uninstall can then remove everything and still never lose the shop. KVNsys Server's setup runs it
  too, on a PC where an earlier install left its data but KVNsys Server isn't installed any more:
  that data is packed away, and the new install starts a new shop instead of picking it back up.

  The archive is one .zip in C:\KVNsys Archives, a folder only Administrators and SYSTEM may open,
  since it holds the shop's records. Inside:
    database.dump            the whole database, in PostgreSQL's own format, like a nightly backup
    Backups\                 the nightly backups that were kept
    Logs\                    the server's logs
    About this archive.txt
  The server's settings, its private key and the stored passwords stay out: a new install makes
  its own. When the database can't be copied that way (KVNsys's PostgreSQL isn't there, or won't
  start), the archive holds the whole data folder as it was instead, PostgreSQL's own files
  included, settings and all.

  Either way the archive is opened and checked before this says it worked, and it says so by
  exiting 0. Only then may anything be removed. Needs administrator rights.
#>
param(
  [string] $DataDir = (Join-Path $env:ProgramData 'KVNsys'),
  [string] $ArchiveDir = (Join-Path $env:SystemDrive 'KVNsys Archives'),
  [string] $InstallDir = (Join-Path $env:ProgramFiles 'KVNsys\PostgreSQL\18'),
  [string] $ServiceName = 'kvnsys-postgresql',
  [string] $LogFile
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$secrets = New-Object System.Collections.Generic.List[string]

function Write-Log([string] $line) {
  foreach ($secret in $secrets) { $line = $line.Replace($secret, '****') }
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $line"
  Write-Host $line
  # A log that can't be written mustn't stop the archive.
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
  return $output
}

# How KVNsys Server signs in to its database: the DATABASE_URL line in its settings.
function Read-DatabaseUrl([string] $file) {
  $line = Get-Content -LiteralPath $file | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
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

# Copies the whole database into one file, the way the nightly backup does, and reads it back in
# full before it counts. Returns the shop's name too, for the archive's file name.
function Save-Database([string] $dumpFile) {
  $bin = Join-Path $InstallDir 'bin'
  if (-not (Test-Path (Join-Path $bin 'pg_dump.exe'))) { throw "There's no pg_dump.exe in $bin." }
  if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) { throw "There's no $ServiceName service." }
  $settings = Join-Path $DataDir 'Server\server.env'
  $db = Read-DatabaseUrl $settings
  if ($db.Password) { $secrets.Add($db.Password) }

  if ((Get-Service -Name $ServiceName).Status -ne 'Running') {
    Write-Log "Starting $ServiceName to copy the database."
    Start-Service -Name $ServiceName
  }
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    & (Join-Path $bin 'pg_isready.exe') -h $db.Host -p $db.Port -q
    $ready = $LASTEXITCODE -eq 0
    if (-not $ready) { Start-Sleep -Seconds 2 }
  }
  if (-not $ready) { throw "The database isn't answering on port $($db.Port)." }

  $env:PGPASSWORD = $db.Password
  try {
    Invoke-Tool (Join-Path $bin 'pg_dump.exe') @(
      '-h', $db.Host, '-p', "$($db.Port)", '-U', $db.User, '-d', $db.Database,
      '--format=custom', '--no-password', "--file=$dumpFile") | Out-Null
    # The first shop recorded is the one the setup made. Only for the file's name, so a database
    # that can't say leaves the name out rather than failing.
    $shop = ''
    try {
      $shop = (& (Join-Path $bin 'psql.exe') -h $db.Host -p $db.Port -U $db.User -d $db.Database --no-password -At `
        -c 'SELECT name FROM locations ORDER BY created_at_date LIMIT 1' 2>$null | Select-Object -First 1)
      if ($LASTEXITCODE -ne 0) { $shop = '' }
    } catch { $shop = '' }
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  Invoke-Tool (Join-Path $bin 'pg_restore.exe') @('--file=NUL', $dumpFile) | Out-Null
  return "$shop".Trim()
}

# Adds one file to the archive. Read with sharing, so a log another program still has open is
# copied as it stands instead of stopping everything.
function Add-File($zip, [string] $path, [string] $entryName) {
  $entry = $zip.CreateEntry($entryName.Replace('\', '/'), [System.IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = (Get-Item -LiteralPath $path).LastWriteTime
  $in = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
  try {
    $out = $entry.Open()
    try { $in.CopyTo($out) } finally { $out.Dispose() }
  } finally {
    $in.Dispose()
  }
}

# Every file under a folder, named in the archive by where it sits under $under.
function Add-Folder($zip, [string] $folder, [string] $under, [string] $prefix) {
  if (-not (Test-Path -LiteralPath $folder)) { return 0 }
  $count = 0
  foreach ($file in Get-ChildItem -LiteralPath $folder -Recurse -File -Force) {
    Add-File $zip $file.FullName ($prefix + $file.FullName.Substring($under.Length).TrimStart('\'))
    $count++
  }
  return $count
}

function Add-Text($zip, [string] $entryName, [string] $text) {
  $entry = $zip.CreateEntry($entryName)
  $writer = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding($true)))
  try { $writer.Write($text) } finally { $writer.Dispose() }
}

# A file name made from the shop's name: anything Windows won't take in a name is left out.
function Get-SafeName([string] $text) {
  $invalid = [IO.Path]::GetInvalidFileNameChars()
  $safe = -join ($text.ToCharArray() | Where-Object { $invalid -notcontains $_ })
  $safe = ($safe -replace '\s+', ' ').Trim().TrimEnd('.')
  if ($safe.Length -gt 40) { $safe = $safe.Substring(0, 40).Trim() }
  return $safe
}

$partial = $null
$dumpFile = $null
try {
  if ($LogFile) { New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null }
  Write-Log "Packing KVNsys Server's data in $DataDir into an archive."
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw 'This needs administrator rights: only administrators may read the shop''s data.' }
  if (-not (Test-Path -LiteralPath $DataDir)) {
    Write-Log 'There is no data to pack. Nothing to do.'
    exit 0
  }

  # The archives are the whole shop, so only Administrators and SYSTEM may open the folder.
  if (-not (Test-Path -LiteralPath $ArchiveDir)) {
    New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null
    & icacls $ArchiveDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Couldn't restrict who can open $ArchiveDir." }
  }

  # The database, copied while PostgreSQL runs. If that can't be done, its own files are taken as
  # they are, with PostgreSQL stopped so they're in one piece.
  $dumpFile = Join-Path ([IO.Path]::GetTempPath()) "kvnsys-archive-$([Guid]::NewGuid().ToString('N')).dump"
  $shop = ''
  $whole = $false
  try {
    $shop = Save-Database $dumpFile
    Write-Log "Copied the database ($('{0:N1}' -f ((Get-Item -LiteralPath $dumpFile).Length / 1MB)) MB)."
  } catch {
    Write-Log "Couldn't copy the database the usual way: $($_.Exception.Message)"
    Write-Log 'Taking the whole data folder as it is instead.'
    $whole = $true
    Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne 'Stopped') {
      Stop-Service -Name $ServiceName -Force
      Write-Log "Stopped $ServiceName, so its files are in one piece."
    }
  }

  $stamp = Get-Date -Format 'yyyy-MM-dd HH-mm-ss'
  $shopPart = Get-SafeName $shop
  $name = if ($shopPart) { "KVNsys $shopPart $stamp.zip" } else { "KVNsys $stamp.zip" }
  $archive = Join-Path $ArchiveDir $name
  $partial = "$archive.partial"

  $files = 0
  $zip = [System.IO.Compression.ZipFile]::Open($partial, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    if ($whole) {
      $files += Add-Folder $zip $DataDir $DataDir 'KVNsys\'
      $inside = "KVNsys\                  everything that was in $DataDir, as it was: PostgreSQL's own files,`r`n" +
        "                         the server's settings and certificate, the backups and the logs"
    } else {
      Add-File $zip $dumpFile 'database.dump'
      $files++
      $files += Add-Folder $zip (Join-Path $DataDir 'Backups') $DataDir ''
      $files += Add-Folder $zip (Join-Path $DataDir 'Logs') $DataDir ''
      $inside = "database.dump            the whole database, in PostgreSQL 18's own format`r`n" +
        "Backups\                 the nightly backups that were kept`r`n" +
        "Logs\                    the server's logs"
    }
    $shopLine = if ($shop) { "The shop: $shop`r`n" } else { '' }
    Add-Text $zip 'About this archive.txt' (
      "KVNsys Server's data from the PC $env:COMPUTERNAME, packed on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`r`n" +
      $shopLine + "`r`n" +
      "Inside:`r`n$inside`r`n`r`n" +
      "KVNsys can't put an archive back yet. The database copy can be put back with PostgreSQL 18's own`r`n" +
      "pg_restore.`r`n")
    $files++
  } finally {
    $zip.Dispose()
  }

  # Opened again and counted before it counts, so an archive cut short never stands in for one
  # that works.
  $check = [System.IO.Compression.ZipFile]::OpenRead($partial)
  try {
    $found = $check.Entries.Count
    if (-not $whole) {
      $entry = $check.GetEntry('database.dump')
      if (-not $entry -or $entry.Length -ne (Get-Item -LiteralPath $dumpFile).Length) { throw 'The database copy in the archive is not the one that was made.' }
    }
  } finally {
    $check.Dispose()
  }
  if ($found -ne $files) { throw "The archive holds $found files, not $files." }
  Move-Item -LiteralPath $partial -Destination $archive
  $partial = $null
  Write-Log "Saved $archive ($('{0:N1}' -f ((Get-Item -LiteralPath $archive).Length / 1MB)) MB, $files files)."
  exit 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  if ($partial) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
  exit 1
} finally {
  if ($dumpFile) { Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue }
}
