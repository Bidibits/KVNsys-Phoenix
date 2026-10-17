<#
  Installs KVNsys's own PostgreSQL on this PC as a Windows service, from the PostgreSQL files that
  `pnpm fetch:installer-parts` unpacked. The server's setup file is meant to run this same script.
  See docs/server-setup-plan.md for the reasoning.

  It never touches another PostgreSQL on the PC: it has its own folders, its own service and its
  own port. An existing data folder is kept and reused, never initialised again. It needs
  administrator rights, because installing a service does.

  Example, from an administrator PowerShell:
    .\install-postgresql.ps1 -SourceDir ..\..\vendor\postgresql\pgsql -ServerSettingsFile C:\ProgramData\KVNsys\Server\server.env
#>
param(
  # The unpacked "pgsql" folder: bin, lib, share.
  [Parameter(Mandatory)] [string] $SourceDir,
  # Where KVNsys Server reads its settings. The DATABASE_URL line goes here.
  [Parameter(Mandatory)] [string] $ServerSettingsFile,
  [string] $InstallDir = (Join-Path $env:ProgramFiles 'KVNsys\PostgreSQL\18'),
  [string] $DataRoot = (Join-Path $env:ProgramData 'KVNsys\PostgreSQL'),
  [int] $Port = 5433,
  [string] $ServiceName = 'kvnsys-postgresql',
  [string] $LogFile
)
$ErrorActionPreference = 'Stop'
$secrets = New-Object System.Collections.Generic.List[string]

function Write-Log([string] $line) {
  # Passwords never reach the screen or the log, even inside a tool's error message.
  foreach ($secret in $secrets) { $line = $line.Replace($secret, '****') }
  Write-Output $line
  if ($LogFile) { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 }
}

# Runs one of PostgreSQL's programs, logs what it says, and stops if it fails.
function Invoke-Tool([string] $program, [string[]] $arguments, [string] $standardInput) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($standardInput) { $output = $standardInput | & $program @arguments 2>&1 } else { $output = & $program @arguments 2>&1 }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  foreach ($line in $output) { Write-Log "    $line" }
  if ($code -ne 0) { throw "$(Split-Path $program -Leaf) failed (exit code $code)." }
}

function New-Password {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $password = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $secrets.Add($password)
  return $password
}

# Readable by Administrators and SYSTEM only. Written by SID, so a Windows in another language works too.
function Protect-ForAdministrators([string] $path) {
  & icacls $path /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Couldn't restrict who can read $path." }
}

function Test-PortInUse([int] $candidate) {
  return [bool](Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue)
}

try {
  if ($LogFile) { Set-Content -LiteralPath $LogFile -Value "KVNsys PostgreSQL install, $(Get-Date -Format s)" -Encoding UTF8 }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw 'This needs administrator rights: installing a Windows service does.' }
  if (-not (Test-Path (Join-Path $SourceDir 'bin\postgres.exe'))) { throw "No PostgreSQL in $SourceDir. Run pnpm fetch:installer-parts first." }

  $dataDir = Join-Path $DataRoot '18\data'
  $superuserFile = Join-Path $DataRoot 'superuser.dpapi'
  $bin = Join-Path $InstallDir 'bin'
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

  # 1. A port nobody else is using, unless it's our own service already on it.
  if (-not $existing) {
    $wanted = $Port
    while ((Test-PortInUse $Port) -and $Port -lt ($wanted + 10)) { $Port++ }
    if (Test-PortInUse $Port) { throw "Ports $wanted to $Port are all in use." }
    if ($Port -ne $wanted) { Write-Log "Port $wanted is taken, so this PostgreSQL uses $Port." }
  }

  # 2. The programs: only what a server needs. No pgAdmin, StackBuilder, docs or headers.
  if ($existing -and $existing.Status -eq 'Running') { Stop-Service -Name $ServiceName }
  Write-Log "Copying PostgreSQL's programs to $InstallDir"
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  foreach ($folder in 'bin', 'lib', 'share') {
    Copy-Item -Path (Join-Path $SourceDir $folder) -Destination $InstallDir -Recurse -Force
  }
  foreach ($licence in 'server_license.txt', 'commandlinetools_3rd_party_licenses.txt') {
    Copy-Item -Path (Join-Path $SourceDir $licence) -Destination $InstallDir -Force
  }

  # 3. The data folder: made once, then always kept.
  Add-Type -AssemblyName System.Security
  if (Test-Path (Join-Path $dataDir 'PG_VERSION')) {
    Write-Log "Keeping the existing data folder, $dataDir"
    $protected = [IO.File]::ReadAllBytes($superuserFile)
    $superuserPassword = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($protected, $null, 'LocalMachine'))
    $secrets.Add($superuserPassword)
  } else {
    Write-Log "Creating the data folder, $dataDir"
    New-Item -ItemType Directory -Force -Path (Split-Path $dataDir) | Out-Null
    $superuserPassword = New-Password
    $passwordFile = Join-Path $DataRoot 'initdb-password.tmp'
    try {
      [IO.File]::WriteAllText($passwordFile, $superuserPassword)
      Protect-ForAdministrators $passwordFile
      # initdb drops administrator rights before it runs, on purpose, so this account needs to read it too.
      & icacls $passwordFile /grant "*$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value):R" | Out-Null
      Invoke-Tool (Join-Path $bin 'initdb.exe') @(
        '-D', $dataDir, '-U', 'postgres', "--pwfile=$passwordFile",
        '--encoding=UTF8', '--locale-provider=builtin', '--builtin-locale=C.UTF-8', '--locale=C',
        '--auth=scram-sha-256')
    } finally {
      Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
    }
    $protected = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($superuserPassword), $null, 'LocalMachine')
    [IO.File]::WriteAllBytes($superuserFile, $protected)
    Protect-ForAdministrators $superuserFile

    # Answers on this PC only. Registers never talk to PostgreSQL; only KVNsys Server does.
    # ASCII: appending UTF-8 here could put a byte-order mark mid-file, which PostgreSQL can't read.
    Add-Content -LiteralPath (Join-Path $dataDir 'postgresql.conf') -Encoding ASCII -Value @(
      '', '# KVNsys', "port = $Port", "listen_addresses = 'localhost'", 'logging_collector = on')
  }

  # 4. The service: starts with Windows, restarts if it stops, under the narrowest account that works.
  if (-not $existing) {
    $accounts = @(@{ Name = "NT SERVICE\$ServiceName"; Grant = "NT SERVICE\${ServiceName}:(OI)(CI)F" },
                  @{ Name = 'NT AUTHORITY\NetworkService'; Grant = '*S-1-5-20:(OI)(CI)F' })
    $started = $false
    foreach ($account in $accounts) {
      Write-Log "Registering the service to run as $($account.Name)"
      Invoke-Tool (Join-Path $bin 'pg_ctl.exe') @('register', '-N', $ServiceName, '-U', $account.Name, '-D', $dataDir, '-S', 'auto')
      & icacls (Split-Path $dataDir) /grant $account.Grant /T /Q | Out-Null
      try {
        Start-Service -Name $ServiceName
        $started = $true
        Write-Log "The service is running as $($account.Name)."
        break
      } catch {
        Write-Log "It wouldn't start as $($account.Name): $($_.Exception.Message)"
        Invoke-Tool (Join-Path $bin 'pg_ctl.exe') @('unregister', '-N', $ServiceName)
      }
    }
    if (-not $started) { throw "The PostgreSQL service wouldn't start. See the log in $(Join-Path $dataDir 'log')." }
    & sc.exe config $ServiceName DisplayName= 'KVNsys PostgreSQL' | Out-Null
    & sc.exe description $ServiceName 'The database for KVNsys Server. Answers on this PC only.' | Out-Null
    & sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
  } else {
    Start-Service -Name $ServiceName
  }

  # 5. Wait until it answers.
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    & (Join-Path $bin 'pg_isready.exe') -h localhost -p $Port | Out-Null
    $ready = $LASTEXITCODE -eq 0
    if (-not $ready) { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { throw "PostgreSQL is running but not answering on port $Port." }

  # 6. KVNsys's own account and database. Not a superuser, and it can't create databases.
  $kvnsysPassword = New-Password
  $env:PGPASSWORD = $superuserPassword
  try {
    $sql = @"
DO `$`$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'kvnsys') THEN
    ALTER ROLE kvnsys LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$kvnsysPassword';
  ELSE
    CREATE ROLE kvnsys LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$kvnsysPassword';
  END IF;
END `$`$;
SELECT 'CREATE DATABASE kvnsys OWNER kvnsys' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kvnsys')\gexec
"@
    Invoke-Tool (Join-Path $bin 'psql.exe') @('-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-') $sql
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }

  # 7. Tell KVNsys Server where its database is.
  New-Item -ItemType Directory -Force -Path (Split-Path $ServerSettingsFile) | Out-Null
  $line = "DATABASE_URL=postgresql://kvnsys:$kvnsysPassword@localhost:$Port/kvnsys"
  # @( ) around the whole if: PowerShell turns a one-item list into plain text otherwise, and the
  # line below would then be glued onto it instead of added under it.
  $settings = @(if (Test-Path -LiteralPath $ServerSettingsFile) { Get-Content -LiteralPath $ServerSettingsFile | Where-Object { $_ -notmatch '^\s*DATABASE_URL\s*=' } } else { "# KVNsys Server's settings on this PC, written like a .env file: NAME=value." })
  Set-Content -LiteralPath $ServerSettingsFile -Value ($settings + $line) -Encoding ASCII
  Write-Log "KVNsys Server's settings point at it: $ServerSettingsFile"

  Write-Log "Done: PostgreSQL 18 is running as the service $ServiceName, on port $Port, on this PC only."
  exit 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  exit 1
}
