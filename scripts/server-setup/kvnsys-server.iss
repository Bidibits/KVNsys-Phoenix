; KVNsys Server Setup.exe: installs KVNsys Server and its own PostgreSQL on a shop's server PC, both as
; Windows services that start with Windows, and the nightly backup. `pnpm package` builds it with
; Inno Setup 7, passing the version. Paths are relative to this folder. The reasoning is in
; docs/server-setup-plan.md.

#ifndef AppVersion
  #error Build this with pnpm package, which says which version it is.
#endif

[Setup]
; Windows knows the installed server by this. Changing it would install a second copy beside the first.
AppId={{FE1FED73-BEAD-48D2-AC69-831D052DCC53}
AppName=KVNsys Server
AppVersion={#AppVersion}
AppVerName=KVNsys Server {#AppVersion}
AppPublisher=KVNsys
VersionInfoVersion={#AppVersion}
VersionInfoProductName=KVNsys Server
VersionInfoCompany=KVNsys
DefaultDirName={autopf}\KVNsys\Server
DisableDirPage=yes
DisableProgramGroupPage=yes
; Windows services can only be installed with administrator rights.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=KVNsys Server Setup
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=KVNsys Server
UninstallDisplayIcon={app}\KVNsys Server.exe
CloseApplications=yes
SetupLogging=yes

[Messages]
FinishedLabelNoIcons=KVNsys Server is installed and running. It's a Windows service now, so it starts by itself whenever this PC starts. There's no window to open.

[Tasks]
Name: firewall; Description: "Let the shop's registers reach KVNsys Server through Windows Firewall (private networks only)"

[Dirs]
; The server's settings and certificate, the logs and the backups. Never removed by uninstalling:
; they're the shop's. Who may use the settings folder is set below, once the service exists; the
; backups folder, by install-backup-task.ps1.
Name: "{commonappdata}\KVNsys\Server"; Flags: uninsneveruninstall
Name: "{commonappdata}\KVNsys\Logs"; Flags: uninsneveruninstall
Name: "{commonappdata}\KVNsys\Backups"; Flags: uninsneveruninstall

[Files]
Source: "..\..\out\KVNsys Server\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; WinSW, renamed: it reads the settings file with the same name beside it.
Source: "..\..\vendor\winsw\WinSW.NET461.exe"; DestDir: "{app}"; DestName: "kvnsys-server-service.exe"; Flags: ignoreversion
Source: "kvnsys-server-service.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\postgresql\install-postgresql.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\remove-postgresql.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\install-backup-task.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\backup-database.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\check-backup.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
; PostgreSQL's programs, trimmed to what a server needs.
Source: "..\..\vendor\postgresql\pgsql\bin\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\lib\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\lib"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\share\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\share"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\server_license.txt"; DestDir: "{autopf}\KVNsys\PostgreSQL\18"; Flags: ignoreversion
Source: "..\..\vendor\postgresql\pgsql\commandlinetools_3rd_party_licenses.txt"; DestDir: "{autopf}\KVNsys\PostgreSQL\18"; Flags: ignoreversion
Source: "..\..\vendor\vc-redist\VC_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[UninstallRun]
; In this order, before any file goes: the nightly backup's task, the server's service, its firewall
; rule, then PostgreSQL's service and programs. The shop's data and its backups stay.
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""KVNsys Nightly Backup"" /F"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveBackupTask"
Filename: "{app}\kvnsys-server-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"
Filename: "{app}\kvnsys-server-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstallServer"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""KVNsys Server"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewallRule"; Tasks: firewall
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\setup\remove-postgresql.ps1"" -InstallDir ""{autopf}\KVNsys\PostgreSQL\18"" -LogFile ""{commonappdata}\KVNsys\Logs\remove-postgresql.log"""; Flags: runhidden waituntilterminated; RunOnceId: "RemovePostgreSQL"

[Code]
const
  PostgreSQLService = 'kvnsys-postgresql';
  ServerService = 'kvnsys-server';

var
  ShopPage: TInputQueryWizardPage;
  { No database on this PC yet, so there's a shop to set up. A reinstall finds the kept one. }
  IsNewShop: Boolean;

function SetEnvironmentVariable(Name, Value: String): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

function Run(const FileName, Parameters: String): Integer;
begin
  if not Exec(FileName, Parameters, '', SW_HIDE, ewWaitUntilTerminated, Result) then Result := -1;
end;

function Sys(const Name: String): String;
begin
  Result := ExpandConstant('{sys}\' + Name);
end;

procedure InitializeWizard;
begin
  IsNewShop := not FileExists(ExpandConstant('{commonappdata}\KVNsys\PostgreSQL\18\data\PG_VERSION'));
  ShopPage := CreateInputQueryPage(wpSelectTasks, 'The shop',
    'This new install needs two answers, just this once.',
    'The administrator signs in on a register as "admin" with this password. Keep it somewhere safe: ' +
    'there''s no other administrator to reset it.');
  ShopPage.Add('The shop''s name:', False);
  ShopPage.Add('A password for the administrator (at least 8 characters):', True);
  ShopPage.Add('Type it again:', True);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PageID = ShopPage.ID) and not IsNewShop;
end;

{ A silent install shows no pages, so it's given these as /ShopName="..." /AdminPassword="...". }
function ShopName: String;
begin
  if WizardSilent then Result := Trim(ExpandConstant('{param:ShopName}')) else Result := Trim(ShopPage.Values[0]);
end;

function AdminPassword: String;
begin
  if WizardSilent then Result := ExpandConstant('{param:AdminPassword}') else Result := ShopPage.Values[1];
end;

{ Checks what will actually be used. A silent install still passes through every page, so it's
  checked too, and stops here, before installing anything, if something is missing. }
function NextButtonClick(CurPageID: Integer): Boolean;
var
  Problem: String;
begin
  Result := True;
  if CurPageID <> ShopPage.ID then Exit;
  if ShopName = '' then
    Problem := 'Type the shop''s name, the way people know it.'
  else if Length(AdminPassword) < 8 then
    Problem := 'A password needs at least 8 characters.'
  else if (not WizardSilent) and (ShopPage.Values[1] <> ShopPage.Values[2]) then
    Problem := 'Those two passwords didn''t match. Once more.';
  if Problem <> '' then
  begin
    MsgBox(Problem, mbError, MB_OK);
    Result := False;
  end;
end;

{ The Visual C++ runtime PostgreSQL's programs need, at the bundled version (14.44) or newer. }
function RuntimeIsCurrent: Boolean;
var
  Installed, Minor: Cardinal;
begin
  Result := RegQueryDWordValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Installed', Installed)
    and (Installed = 1)
    and RegQueryDWordValue(HKLM64, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', 'Minor', Minor)
    and (Minor >= 44);
end;

procedure ReportFailure(const What, Where: String);
begin
  Log('Failed: ' + What);
  if not WizardSilent then
    MsgBox('KVNsys Server was copied onto this PC, but ' + What + ' didn''t work.' + #13#10#13#10 +
      'The details are in ' + Where + '. Running this setup again is safe.', mbError, MB_OK);
end;

{ The service and Administrators may use the settings folder, and nobody else: it holds the
  database password and the server's private key. The service also writes the logs. }
procedure GiveFoldersTo(const Account: String);
var
  Data: String;
begin
  Data := ExpandConstant('{commonappdata}\KVNsys');
  { The folder gets the permissions; everything already inside is told to take them from the folder. }
  Run(Sys('icacls.exe'), '"' + Data + '\Server" /inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F "' + Account + ':(OI)(CI)M"');
  Run(Sys('icacls.exe'), '"' + Data + '\Server\*" /reset /T /C /Q');
  Run(Sys('icacls.exe'), '"' + Data + '\Logs" /grant "' + Account + ':(OI)(CI)M"');
  Run(Sys('icacls.exe'), '"' + Data + '\Logs\*" /reset /T /C /Q');
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Programs, SetUpLog: String;
begin
  if CurStep = ssInstall then
  begin
    { Programs are about to be replaced, so the services have to let go of them first. }
    Run(Sys('net.exe'), 'stop ' + ServerService);
    Run(Sys('net.exe'), 'stop ' + PostgreSQLService);
  end;
  if CurStep <> ssPostInstall then Exit;

  { Files already in the settings folder take their permissions from the folder again, whatever an
    earlier install left them with. Administrators own them, so this works even on a locked file. }
  Run(Sys('icacls.exe'), '"' + ExpandConstant('{commonappdata}\KVNsys\Server\*') + '" /reset /T /C /Q');

  if not RuntimeIsCurrent then
  begin
    WizardForm.StatusLabel.Caption := 'Installing Microsoft''s Visual C++ runtime...';
    { 1638: a newer one is already there. 3010: installed, and Windows wants a restart some time. }
    Code := Run(ExpandConstant('{tmp}\VC_redist.x64.exe'), '/install /quiet /norestart');
    if not ((Code = 0) or (Code = 1638) or (Code = 3010)) then
    begin
      ReportFailure('installing Microsoft''s Visual C++ runtime (code ' + IntToStr(Code) + ')', 'the setup log');
      Exit;
    end;
  end;

  WizardForm.StatusLabel.Caption := 'Setting up the database (PostgreSQL)...';
  Programs := ExpandConstant('{autopf}\KVNsys\PostgreSQL\18');
  if Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup\install-postgresql.ps1') + '"' +
      ' -SourceDir "' + Programs + '" -InstallDir "' + Programs + '"' +
      ' -ServerSettingsFile "' + ExpandConstant('{commonappdata}\KVNsys\Server\server.env') + '"' +
      ' -LogFile "' + ExpandConstant('{commonappdata}\KVNsys\Logs\install-postgresql.log') + '"') <> 0 then
  begin
    ReportFailure('setting up PostgreSQL', ExpandConstant('{commonappdata}\KVNsys\Logs\install-postgresql.log'));
    Exit;
  end;

  { Installing over a shop that's already here: a copy of its database first, made by the nightly
    backup's own script, before KVNsys Server brings the database up to date. The update itself is
    all or nothing; the copy is there in case the new version turns out to be wrong. }
  if not IsNewShop then
  begin
    { Every path is handed over: PowerShell started from here runs as 32-bit, and would take
      "Program Files" to mean Program Files (x86). }
    WizardForm.StatusLabel.Caption := 'Saving a copy of the database before updating it...';
    if Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
        '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup\backup-database.ps1') + '"' +
        ' -InstallDir "' + ExpandConstant('{autopf}\KVNsys\PostgreSQL\18') + '"' +
        ' -ServerSettingsFile "' + ExpandConstant('{commonappdata}\KVNsys\Server\server.env') + '"' +
        ' -BackupDir "' + ExpandConstant('{commonappdata}\KVNsys\Backups') + '"' +
        ' -LogFile "' + ExpandConstant('{commonappdata}\KVNsys\Logs\backup.log') + '"') <> 0 then
      ReportFailure('saving a copy of the database before updating it', ExpandConstant('{commonappdata}\KVNsys\Logs\backup.log'));
  end;

  { KVNsys Server sets up its tables, or brings them up to date, and on a new install the shop. The
    answers reach it in its environment for this one run, never on disk or on a command line. }
  WizardForm.StatusLabel.Caption := 'Setting up the shop...';
  SetUpLog := ExpandConstant('{commonappdata}\KVNsys\Logs\set-up.log');
  if IsNewShop then
  begin
    SetEnvironmentVariable('KVNSYS_LOCATION_NAME', ShopName);
    SetEnvironmentVariable('KVNSYS_ADMIN_PASSWORD', AdminPassword);
  end;
  Code := Run(ExpandConstant('{cmd}'), '/c ""' + ExpandConstant('{app}\KVNsys Server.exe') + '" --set-up > "' + SetUpLog + '" 2>&1"');
  SetEnvironmentVariable('KVNSYS_LOCATION_NAME', '');
  SetEnvironmentVariable('KVNSYS_ADMIN_PASSWORD', '');
  if Code <> 0 then
  begin
    ReportFailure('setting up the shop', SetUpLog);
    Exit;
  end;

  { The service: under its own narrow account, or Windows' LocalService if a PC refuses that. }
  WizardForm.StatusLabel.Caption := 'Starting KVNsys Server as a Windows service...';
  if Run(Sys('sc.exe'), 'query ' + ServerService) <> 0 then
    Run(ExpandConstant('{app}\kvnsys-server-service.exe'), 'install');
  GiveFoldersTo('NT SERVICE\' + ServerService);

  if WizardIsTaskSelected('firewall') then
  begin
    Run(Sys('netsh.exe'), 'advfirewall firewall delete rule name="KVNsys Server"');
    Run(Sys('netsh.exe'), 'advfirewall firewall add rule name="KVNsys Server" dir=in action=allow protocol=TCP localport=9000 profile=private program="' + ExpandConstant('{app}\KVNsys Server.exe') + '"');
  end;

  if Run(Sys('net.exe'), 'start ' + ServerService) <> 0 then
  begin
    Log('The service would not start under its own account; trying LocalService.');
    Run(Sys('sc.exe'), 'config ' + ServerService + ' obj= "NT AUTHORITY\LocalService" password= ""');
    GiveFoldersTo('*S-1-5-19');
    if Run(Sys('net.exe'), 'start ' + ServerService) <> 0 then
      ReportFailure('starting the KVNsys Server service', ExpandConstant('{commonappdata}\KVNsys\Logs'));
  end;

  { A copy of the database every night at 11 PM, or soon after the PC starts if it was off then. }
  WizardForm.StatusLabel.Caption := 'Setting up the nightly backup...';
  if Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup\install-backup-task.ps1') + '"' +
      ' -BackupScript "' + ExpandConstant('{app}\setup\backup-database.ps1') + '"' +
      ' -BackupDir "' + ExpandConstant('{commonappdata}\KVNsys\Backups') + '"' +
      ' -LogFile "' + ExpandConstant('{commonappdata}\KVNsys\Logs\install-backup-task.log') + '"') <> 0 then
    ReportFailure('setting up the nightly backup', ExpandConstant('{commonappdata}\KVNsys\Logs\install-backup-task.log'));
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    MsgBox('KVNsys Server is removed. The shop''s data was kept, in ' + ExpandConstant('{commonappdata}\KVNsys') + '.', mbInformation, MB_OK);
end;
