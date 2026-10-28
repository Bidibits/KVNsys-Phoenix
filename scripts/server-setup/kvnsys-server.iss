; KVNsys Server Setup.exe: installs KVNsys Server and its own PostgreSQL on a shop's server PC, both as
; Windows services, the server's dashboard with its desktop icon, and the nightly backup. PostgreSQL
; starts with Windows. On a new install the server itself is off until someone turns it on from the
; dashboard, which is also where it's set to start with Windows; a reinstall keeps whatever was
; chosen.
;
; Run where KVNsys Server is installed, it updates it and keeps the shop. Run where it isn't, it
; always starts a new shop: anything an earlier install left behind is packed into an archive in
; C:\KVNsys Archives first (archive-shop.ps1), never picked back up. Uninstalling packs the shop
; into an archive the same way, then removes everything else.
;
; `pnpm package` builds it with Inno Setup 7, passing the version. Paths are relative to this
; folder. The reasoning is in docs/server-setup-plan.md.

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
UninstallDisplayIcon={app}\Dashboard\KVNsys Server Dashboard.exe
CloseApplications=yes
SetupLogging=yes

[Messages]
FinishedLabel=KVNsys Server is installed. Open it from the KVNsys Server icon on the desktop to turn the server on or off, see who's connected, and choose whether it starts when this PC starts.

[Tasks]
Name: firewall; Description: "Let the shop's registers reach KVNsys Server through Windows Firewall (private networks only)"

[Dirs]
; The server's settings and certificate, the logs and the backups. Inno Setup never removes them
; itself: they're the shop's, so the uninstall packs them into an archive first and removes them
; only once that worked (CurUninstallStepChanged). Who may use the settings folder is set below,
; once the service exists; the backups folder, by install-backup-task.ps1.
Name: "{commonappdata}\KVNsys\Server"; Flags: uninsneveruninstall
Name: "{commonappdata}\KVNsys\Logs"; Flags: uninsneveruninstall
Name: "{commonappdata}\KVNsys\Backups"; Flags: uninsneveruninstall

[Files]
Source: "..\..\out\KVNsys Server\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; The dashboard: its own window. Its icons below open it as administrator.
Source: "..\..\out\KVNsys Server Dashboard\*"; DestDir: "{app}\Dashboard"; Flags: ignoreversion recursesubdirs createallsubdirs
; WinSW, renamed: it reads the settings file with the same name beside it.
Source: "..\..\vendor\winsw\WinSW.NET461.exe"; DestDir: "{app}"; DestName: "kvnsys-server-service.exe"; Flags: ignoreversion
Source: "kvnsys-server-service.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\postgresql\install-postgresql.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\remove-postgresql.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\install-backup-task.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\backup-database.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\check-backup.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "archive-shop.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
; PostgreSQL's programs, trimmed to what a server needs.
Source: "..\..\vendor\postgresql\pgsql\bin\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\lib\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\lib"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\share\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\share"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\server_license.txt"; DestDir: "{autopf}\KVNsys\PostgreSQL\18"; Flags: ignoreversion
Source: "..\..\vendor\postgresql\pgsql\commandlinetools_3rd_party_licenses.txt"; DestDir: "{autopf}\KVNsys\PostgreSQL\18"; Flags: ignoreversion
Source: "..\..\vendor\vc-redist\VC_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
; For everyone who uses this PC. Only administrators can use the dashboard: the setup marks both
; "Run as administrator" (MarkRunAsAdministrator), so Windows asks.
Name: "{autodesktop}\KVNsys Server"; Filename: "{app}\Dashboard\KVNsys Server Dashboard.exe"; Comment: "Turn KVNsys Server on and off, and see who's connected"
Name: "{autoprograms}\KVNsys Server"; Filename: "{app}\Dashboard\KVNsys Server Dashboard.exe"; Comment: "Turn KVNsys Server on and off, and see who's connected"

[Run]
Filename: "{app}\Dashboard\KVNsys Server Dashboard.exe"; Description: "Open KVNsys Server now"; Flags: postinstall nowait skipifsilent shellexec

[UninstallRun]
; In this order, before any file goes: the nightly backup's task, the server's service, its firewall
; rule, then PostgreSQL's service and programs. The shop was packed into an archive just before
; (CurUninstallStepChanged), and its data goes once these are done.
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""KVNsys Nightly Backup"" /F"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveBackupTask"
Filename: "{app}\kvnsys-server-service.exe"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"
Filename: "{app}\kvnsys-server-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "UninstallServer"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""KVNsys Server"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewallRule"; Tasks: firewall
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\setup\remove-postgresql.ps1"" -InstallDir ""{autopf}\KVNsys\PostgreSQL\18"" -LogFile ""{commonappdata}\KVNsys\Logs\remove-postgresql.log"""; Flags: runhidden waituntilterminated; RunOnceId: "RemovePostgreSQL"

[Code]
const
  PostgreSQLService = 'kvnsys-postgresql';
  ServerService = 'kvnsys-server';
  { Windows' record of this install, under the AppId above. }
  UninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{FE1FED73-BEAD-48D2-AC69-831D052DCC53}_is1';
  DashboardProgram = 'KVNsys Server Dashboard.exe';

var
  ShopPage: TInputQueryWizardPage;
  { No database on this PC yet, so there's a shop to set up. An update finds the one it keeps. }
  IsNewShop: Boolean;
  { KVNsys Server isn't installed, but an earlier install left its data. It's packed into an
    archive before anything is installed, and this install starts a new shop. }
  HasLeftovers: Boolean;
  { The server was on when this setup began. A new install's never is. }
  ServerWasRunning: Boolean;
  { Uninstalling: the shop was packed into an archive, so its data may go. }
  ShopArchived: Boolean;

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

{ Marks a shortcut "Run as administrator" (its Advanced properties): Windows asks for administrator
  rights each time it's opened. The dashboard needs them, but its program can't say so itself: a
  program marked to always need them can't start its window's helper processes, and the window
  crashes. The mark is bit 0x20 of byte 0x15 of the shortcut file. }
procedure MarkRunAsAdministrator(const Shortcut: String);
begin
  Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -Command "$p = ''' + Shortcut + '''; if (Test-Path -LiteralPath $p) { $b = [IO.File]::ReadAllBytes($p); $b[0x15] = $b[0x15] -bor 0x20; [IO.File]::WriteAllBytes($p, $b) }"');
end;

{ Asked by the service's state as .NET names it, not by sc.exe's words, which a Windows in another
  language may translate. }
function ServiceIsRunning(const Name: String): Boolean;
begin
  Result := Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -Command "if ((Get-Service -Name ''' + Name + ''' -ErrorAction SilentlyContinue).Status -eq ''Running'') { exit 0 } else { exit 1 }"') = 0;
end;

function DataFolder: String;
begin
  Result := ExpandConstant('{commonappdata}\KVNsys');
end;

function ArchiveFolder: String;
begin
  Result := ExpandConstant('{sd}\KVNsys Archives');
end;

{ The dashboard runs from the folder being replaced or removed, and Windows won't let a running
  program's files go. It's only a window: closing it leaves the server as it is. }
procedure CloseDashboard;
begin
  Run(Sys('taskkill.exe'), '/F /T /IM "' + DashboardProgram + '"');
end;

{ Packs the shop's data into one archive in C:\KVNsys Archives. True once the archive is made and
  checked; only then may the data be removed. }
function ArchiveShop(const Script: String): Boolean;
begin
  Result := Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + Script + '"' +
    ' -DataDir "' + DataFolder + '" -ArchiveDir "' + ArchiveFolder + '"' +
    ' -InstallDir "' + ExpandConstant('{autopf}\KVNsys\PostgreSQL\18') + '"' +
    ' -LogFile "' + DataFolder + '\Logs\archive-shop.log"') = 0;
end;

procedure InitializeWizard;
var
  About: String;
begin
  { Installed means updating: the shop is kept. Not installed means a new shop, always. }
  HasLeftovers := (not RegKeyExists(HKLM64, UninstallKey)) and DirExists(DataFolder);
  IsNewShop := HasLeftovers or not FileExists(DataFolder + '\PostgreSQL\18\data\PG_VERSION');
  About := 'The administrator signs in on a register as "admin" with this password. Keep it somewhere safe: ' +
    'there''s no other administrator to reset it.';
  if HasLeftovers then
    About := 'KVNsys Server was on this PC before. What it left behind will be packed into one archive in ' +
      ArchiveFolder + ', and this install starts a new shop.' + #13#10#13#10 + About;
  ShopPage := CreateInputQueryPage(wpSelectTasks, 'The shop',
    'This new install needs two answers, just this once.', About);
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

{ Before anything is copied. What's said here stops the setup with nothing changed. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  CloseDashboard;
  if not HasLeftovers then Exit;

  WizardForm.PreparingLabel.Caption := 'Packing what an earlier install left behind into an archive...';
  ExtractTemporaryFile('archive-shop.ps1');
  if not ArchiveShop(ExpandConstant('{tmp}\archive-shop.ps1')) then
  begin
    Result := 'KVNsys Server was on this PC before, and what it left behind is still in ' + DataFolder +
      '. It couldn''t be packed into an archive, so nothing was changed. The details are in ' +
      DataFolder + '\Logs\archive-shop.log.';
    Exit;
  end;
  { A PostgreSQL an earlier install left registered would still have its files open. }
  Run(Sys('net.exe'), 'stop ' + ServerService);
  Run(Sys('net.exe'), 'stop ' + PostgreSQLService);
  DelTree(DataFolder, True, True, True);
  if DirExists(DataFolder) then
    Result := 'What an earlier install left behind was packed into an archive in ' + ArchiveFolder +
      ', but some of it couldn''t be removed from ' + DataFolder + '. Restart this PC and run the setup again.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Programs, SetUpLog: String;
begin
  if CurStep = ssInstall then
  begin
    { Programs are about to be replaced, so the services have to let go of them first. Whether the
      server was on is noted first, so a reinstall leaves it as it found it. }
    ServerWasRunning := ServiceIsRunning(ServerService);
    Run(Sys('net.exe'), 'stop ' + ServerService);
    Run(Sys('net.exe'), 'stop ' + PostgreSQLService);
  end;
  if CurStep <> ssPostInstall then Exit;

  MarkRunAsAdministrator(ExpandConstant('{autodesktop}\KVNsys Server.lnk'));
  MarkRunAsAdministrator(ExpandConstant('{autoprograms}\KVNsys Server.lnk'));

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

  { KVNsys Server sets up its tables, and on a new install the shop. The answers reach it in its
    environment for this one run, never on disk or on a command line. }
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

  { The service: under its own narrow account, or Windows' LocalService if a PC refuses that. A new
    one starts only when asked (kvnsys-server-service.xml); an existing one keeps its setting. It's
    started here once either way, to prove it can start, and turned off again below if it was off. }
  WizardForm.StatusLabel.Caption := 'Checking that KVNsys Server starts...';
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

  { Off until someone turns it on from the dashboard, unless it was on before this setup ran. }
  if not ServerWasRunning then
    Run(Sys('net.exe'), 'stop ' + ServerService);

  { A copy of the database every night at 11 PM, or soon after the PC starts if it was off then. }
  WizardForm.StatusLabel.Caption := 'Setting up the nightly backup...';
  if Run(Sys('WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup\install-backup-task.ps1') + '"' +
      ' -BackupScript "' + ExpandConstant('{app}\setup\backup-database.ps1') + '"' +
      ' -BackupDir "' + ExpandConstant('{commonappdata}\KVNsys\Backups') + '"' +
      ' -LogFile "' + ExpandConstant('{commonappdata}\KVNsys\Logs\install-backup-task.log') + '"') <> 0 then
    ReportFailure('setting up the nightly backup', ExpandConstant('{commonappdata}\KVNsys\Logs\install-backup-task.log'));
end;

{ Uninstalling. Before anything is removed, the shop is packed into an archive: with the server
  stopped, so nothing changes while it's copied, and PostgreSQL still running, so the database can be
  copied properly. Once everything else is gone, the shop's data goes too, but only if the archive
  was made. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Said: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    CloseDashboard;
    Run(Sys('net.exe'), 'stop ' + ServerService);
    ShopArchived := ArchiveShop(ExpandConstant('{app}\setup\archive-shop.ps1'));
  end;
  if CurUninstallStep <> usPostUninstall then Exit;

  { The dashboard's window keeps its own small folder for the person who opened it. }
  DelTree(ExpandConstant('{userappdata}\KVNsys Server'), True, True, True);
  if ShopArchived then
  begin
    DelTree(DataFolder, True, True, True);
    Said := 'KVNsys Server is removed. The shop''s records were packed into one archive, in ' + ArchiveFolder + '.';
    if DirExists(DataFolder) then
      Said := Said + #13#10#13#10 + 'Some files in ' + DataFolder + ' couldn''t be removed. The archive has them all, ' +
        'so that folder can be deleted by hand.';
  end
  else
    Said := 'KVNsys Server is removed, but the shop''s records couldn''t be packed into an archive, so they were ' +
      'left where they are, in ' + DataFolder + '. The details are in ' + DataFolder + '\Logs\archive-shop.log.';
  Log(Said);
  if not UninstallSilent then
    MsgBox(Said, mbInformation, MB_OK);
end;
