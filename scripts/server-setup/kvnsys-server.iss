; KVNsys Server Setup.exe: installs KVNsys Server and its own PostgreSQL on a shop's server PC.
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
; A Windows service can only be installed with administrator rights.
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

[Dirs]
; The server's settings and certificate. Never removed by uninstalling: they're the shop's.
; Any account on the PC may change them for now, because the server runs as whoever starts it.
; Once it runs as a Windows service, this narrows to the service and Administrators.
Name: "{commonappdata}\KVNsys\Server"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{commonappdata}\KVNsys\Logs"; Flags: uninsneveruninstall

[Files]
Source: "..\..\out\KVNsys Server\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\postgresql\install-postgresql.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
Source: "..\postgresql\remove-postgresql.ps1"; DestDir: "{app}\setup"; Flags: ignoreversion
; PostgreSQL's programs, trimmed to what a server needs.
Source: "..\..\vendor\postgresql\pgsql\bin\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\lib\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\lib"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\share\*"; DestDir: "{autopf}\KVNsys\PostgreSQL\18\share"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\postgresql\pgsql\server_license.txt"; DestDir: "{autopf}\KVNsys\PostgreSQL\18"; Flags: ignoreversion
Source: "..\..\vendor\postgresql\pgsql\commandlinetools_3rd_party_licenses.txt"; DestDir: "{autopf}\KVNsys\PostgreSQL\18"; Flags: ignoreversion
Source: "..\..\vendor\vc-redist\VC_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autodesktop}\KVNsys Server"; Filename: "{app}\KVNsys Server.exe"; WorkingDir: "{app}"; Comment: "Starts KVNsys Server on this PC"
Name: "{autoprograms}\KVNsys Server"; Filename: "{app}\KVNsys Server.exe"; WorkingDir: "{app}"; Comment: "Starts KVNsys Server on this PC"

[Run]
; On the last page: start it now, as the person signed in rather than with the setup's administrator rights.
Filename: "{app}\KVNsys Server.exe"; WorkingDir: "{app}"; Description: "Start KVNsys Server"; Flags: postinstall nowait skipifsilent runasoriginaluser

[UninstallRun]
; The PostgreSQL service goes first, so its programs can be removed. Its data stays.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\setup\remove-postgresql.ps1"" -InstallDir ""{autopf}\KVNsys\PostgreSQL\18"" -LogFile ""{commonappdata}\KVNsys\Logs\remove-postgresql.log"""; Flags: runhidden waituntilterminated; RunOnceId: "RemovePostgreSQL"

[Code]
const
  PostgreSQLService = 'kvnsys-postgresql';

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

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  LogFile, Programs: String;
begin
  if CurStep = ssInstall then
    { PostgreSQL's programs are about to be replaced, so its service has to let go of them first. }
    Exec(ExpandConstant('{sys}\net.exe'), 'stop ' + PostgreSQLService, '', SW_HIDE, ewWaitUntilTerminated, Code);

  if CurStep = ssPostInstall then
  begin
    if not RuntimeIsCurrent then
    begin
      WizardForm.StatusLabel.Caption := 'Installing Microsoft''s Visual C++ runtime...';
      { 1638: a newer one is already there. 3010: installed, and Windows wants a restart some time. }
      if not Exec(ExpandConstant('{tmp}\VC_redist.x64.exe'), '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, Code)
        or not ((Code = 0) or (Code = 1638) or (Code = 3010)) then
      begin
        ReportFailure('installing Microsoft''s Visual C++ runtime (code ' + IntToStr(Code) + ')', 'the setup log');
        Exit;
      end;
    end;

    WizardForm.StatusLabel.Caption := 'Setting up the database (PostgreSQL)...';
    Programs := ExpandConstant('{autopf}\KVNsys\PostgreSQL\18');
    LogFile := ExpandConstant('{commonappdata}\KVNsys\Logs\install-postgresql.log');
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
        '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\setup\install-postgresql.ps1') + '"' +
        ' -SourceDir "' + Programs + '" -InstallDir "' + Programs + '"' +
        ' -ServerSettingsFile "' + ExpandConstant('{commonappdata}\KVNsys\Server\server.env') + '"' +
        ' -LogFile "' + LogFile + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then
      ReportFailure('setting up the database', LogFile);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    MsgBox('KVNsys Server is removed. The shop''s data was kept, in ' + ExpandConstant('{commonappdata}\KVNsys') + '.', mbInformation, MB_OK);
end;
