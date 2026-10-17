<#
  Removes what install-postgresql.ps1 installed: the service and the programs. The data folder and
  the stored password are kept unless -RemoveData is given, because deleting a shop's data should
  never happen by accident. Needs administrator rights.
#>
param(
  [string] $InstallDir = (Join-Path $env:ProgramFiles 'KVNsys\PostgreSQL\18'),
  [string] $DataRoot = (Join-Path $env:ProgramData 'KVNsys\PostgreSQL'),
  [string] $ServiceName = 'kvnsys-postgresql',
  [switch] $RemoveData,
  [string] $LogFile
)
$ErrorActionPreference = 'Stop'

function Write-Log([string] $line) {
  Write-Output $line
  if ($LogFile) { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 }
}

# Removes a folder, then its parent too if that's left empty (the KVNsys folders above it).
function Remove-Folder([string] $path) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Log "Removed $path"
  }
  $parent = Split-Path $path
  while ($parent -and (Test-Path -LiteralPath $parent) -and -not (Get-ChildItem -LiteralPath $parent -Force) -and (Split-Path $parent -Leaf) -match '^(KVNsys|PostgreSQL)$') {
    Remove-Item -LiteralPath $parent -Force
    Write-Log "Removed the empty folder $parent"
    $parent = Split-Path $parent
  }
}

try {
  if ($LogFile) { Set-Content -LiteralPath $LogFile -Value "KVNsys PostgreSQL removal, $(Get-Date -Format s)" -Encoding UTF8 }
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { throw 'This needs administrator rights: removing a Windows service does.' }

  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne 'Stopped') { Stop-Service -Name $ServiceName -Force; Write-Log "Stopped the service $ServiceName" }
    & sc.exe delete $ServiceName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Couldn't remove the service $ServiceName." }
    Write-Log "Removed the service $ServiceName"
  }
  Remove-Folder $InstallDir
  if ($RemoveData) {
    Remove-Folder $DataRoot
  } elseif (Test-Path -LiteralPath $DataRoot) {
    Write-Log "Kept the data and the stored password in $DataRoot"
  }
  Write-Log 'Done.'
  exit 0
} catch {
  Write-Log "FAILED: $($_.Exception.Message)"
  exit 1
}
