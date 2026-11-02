; Uninstall all KVNsys.exe: one double-click that takes KVNsys off a PC, for a fresh start. It runs, one
; after the other and quietly, the uninstallers already there:
;   KVNsys POS & Inventory's, which removes the app and its settings;
;   a copy `pnpm install:here` made, removed with its desktop icons;
;   KVNsys Server's, which packs the location's records into one archive in C:\KVNsys Archives first, then removes
;   the server, its PostgreSQL, the dashboard, the nightly backup and the firewall rule.
; The archives in C:\KVNsys Archives are kept. It says what it found before it removes anything, and
; what happened after. It installs nothing itself, so there's nothing of it to uninstall.
;
; /CHECK=<file> only writes what it found to that file and removes nothing. With /CURRENTUSER it then
; needs no administrator rights (`pnpm check:package` uses that); removing always does.
;
; `pnpm package` builds it with Inno Setup 7, beside the two setup files.

#ifndef AppVersion
  #error Build this with pnpm package, which says which version it is.
#endif

[Setup]
AppName=Uninstall all KVNsys
AppVersion={#AppVersion}
AppPublisher=KVNsys
VersionInfoVersion={#AppVersion}
VersionInfoProductName=Uninstall all KVNsys
VersionInfoCompany=KVNsys
CreateAppDir=no
Uninstallable=no
DisableProgramGroupPage=yes
; The server's uninstaller needs administrator rights. /CURRENTUSER is for /CHECK only.
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=Uninstall all KVNsys
WizardStyle=modern
SetupLogging=yes

[Messages]
SetupWindowTitle=%1
WizardReady=Ready to take KVNsys off this PC
ReadyLabel1=Here's what's on this PC, and what happens to it.
ReadyLabel2a=Click Remove to go on, or Cancel to leave everything as it is.
ReadyLabel2b=Click Remove to go on, or Cancel to leave everything as it is.
ButtonInstall=&Remove
WizardInstalling=Taking KVNsys off this PC
InstallingLabel=Please wait. Packing the location's records into an archive can take a few minutes.
ClickFinish=Click Finish to close this window.
ExitSetupMessage=Nothing has been removed yet. Close and leave everything as it is?

[Code]
const
  { Windows' record of KVNsys Server, under its setup's AppId. }
  ServerUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{FE1FED73-BEAD-48D2-AC69-831D052DCC53}_is1';
  { Windows' record of KVNsys POS & Inventory, for the person who installed it. electron-builder names it
    after the app's id, com.kvnsys.pos-inventory, which never changes. }
  AppUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\2b496fba-f10a-5cc0-9abd-0156bf729cf7';
  AppProgram = 'KVNsys POS & Inventory.exe';
  { The longest an uninstaller is waited for: packing years of records into an archive takes a while. }
  WaitSeconds = '900';

var
  { What's there, found when this starts. Empty when it isn't. }
  ServerUninstaller: String;
  AppUninstaller: String;
  HereCopy: String;
  { What happened, for the last page. }
  Outcome: String;
  Removed: Boolean;

function Run(const FileName, Parameters: String): Integer;
begin
  if not Exec(FileName, Parameters, '', SW_HIDE, ewWaitUntilTerminated, Result) then Result := -1;
end;

function Sys(const Name: String): String;
begin
  Result := ExpandConstant('{sys}\' + Name);
end;

{ Text for PowerShell inside single quotes. }
function Quoted(Text: String): String;
begin
  StringChangeEx(Text, '''', '''''', True);
  Result := '''' + Text + '''';
end;

function PowerShell(const Command: String): Integer;
begin
  Result := Run(Sys('WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "' + Command + '"');
end;

function DataFolder: String;
begin
  Result := ExpandConstant('{commonappdata}\KVNsys');
end;

function ArchiveFolder: String;
begin
  Result := ExpandConstant('{sd}\KVNsys Archives');
end;

function ArchiveCount: Integer;
var
  Found: TFindRec;
begin
  Result := 0;
  if FindFirst(ArchiveFolder + '\*.zip', Found) then
  try
    repeat
      Result := Result + 1;
    until not FindNext(Found);
  finally
    FindClose(Found);
  end;
end;

{ '"C:\a b\x.exe" /y /z' as the program and what follows it. }
procedure SplitCommand(const Command: String; var Exe, Parameters: String);
var
  Closing: Integer;
begin
  Exe := Command;
  Parameters := '';
  if (Length(Command) > 0) and (Command[1] = '"') then
  begin
    Closing := Pos('"', Copy(Command, 2, Length(Command)));
    if Closing > 0 then
    begin
      Exe := Copy(Command, 2, Closing - 1);
      Parameters := Trim(Copy(Command, Closing + 2, Length(Command)));
    end;
  end;
end;

procedure Say(const Text: String);
begin
  Log(Text);
  if Outcome <> '' then Outcome := Outcome + #13#10#13#10;
  Outcome := Outcome + Text;
end;

procedure Doing(const Text: String);
begin
  Log(Text);
  WizardForm.StatusLabel.Caption := Text;
end;

{ An uninstaller hands over to a copy of itself and returns at once. This waits for the copy, without
  freezing this window: until Windows' record of what it removes and its program are both gone, or no
  uninstaller is running any more, or WaitSeconds have passed. The names are the uninstallers' own
  (Inno Setup's unins000 and its _iu copy, NSIS's Au_ or Un_ copy, the app's), never one that starts
  like this program's name, or this would wait for itself. }
procedure WaitForUninstaller(const RegistryKey, Exe: String);
begin
  PowerShell(
    '$end = (Get-Date).AddSeconds(' + WaitSeconds + '); ' +
    'do { Start-Sleep -Milliseconds 700; ' +
    '$left = (Test-Path -LiteralPath ' + Quoted(RegistryKey) + ') -or (Test-Path -LiteralPath ' + Quoted(Exe) + '); ' +
    '$busy = [bool](Get-Process | Where-Object { $_.ProcessName -like ''_iu*'' -or $_.ProcessName -like ''Au_*'' -or $_.ProcessName -like ''Un_*'' -or $_.ProcessName -like ''unins0*'' -or $_.ProcessName -like ''Uninstall KVNsys*'' }) ' +
    '} while ($left -and $busy -and ((Get-Date) -lt $end))');
end;

function InitializeSetup: Boolean;
var
  Found: String;
begin
  if RegQueryStringValue(HKLM64, ServerUninstallKey, 'UninstallString', ServerUninstaller) then
    ServerUninstaller := RemoveQuotes(ServerUninstaller)
  else
    ServerUninstaller := '';
  if not RegQueryStringValue(HKCU, AppUninstallKey, 'QuietUninstallString', AppUninstaller) then AppUninstaller := '';
  HereCopy := ExpandConstant('{localappdata}\Programs\KVNsys');
  if not DirExists(HereCopy) then HereCopy := '';

  if ExpandConstant('{param:CHECK|}') <> '' then
  begin
    Found := 'server=' + ServerUninstaller + #13#10 + 'app=' + AppUninstaller + #13#10 + 'here=' + HereCopy + #13#10 +
      'leftovers=' + IntToStr(Ord((ServerUninstaller = '') and DirExists(DataFolder))) + #13#10;
    SaveStringToFile(ExpandConstant('{param:CHECK}'), Found, False);
    Result := False;
    Exit;
  end;

  if not IsAdmin then
  begin
    SuppressibleMsgBox('Removing KVNsys needs administrator rights. Run Uninstall all KVNsys again and choose Yes when Windows asks.', mbError, MB_OK, IDOK);
    Result := False;
    Exit;
  end;

  Result := (ServerUninstaller <> '') or (AppUninstaller <> '') or (HereCopy <> '');
  if not Result then
  begin
    Found := 'KVNsys isn''t installed on this PC, so there''s nothing to remove.';
    if DirExists(DataFolder) then
      Found := Found + #13#10#13#10 + DataFolder + ' still holds what an earlier KVNsys Server left. The next KVNsys Server Setup ' +
        'packs it into an archive in ' + ArchiveFolder + ' before it starts a new location.';
    SuppressibleMsgBox(Found, mbInformation, MB_OK, IDOK);
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := 'Removed:' + NewLine;
  if AppUninstaller <> '' then
    Result := Result + Space + 'KVNsys POS & Inventory, with its settings (the server it connects to and the one it trusts).' + NewLine;
  if HereCopy <> '' then
    Result := Result + Space + 'The copy pnpm install:here made, in ' + HereCopy + ', and its desktop icons.' + NewLine;
  if ServerUninstaller <> '' then
    Result := Result + Space + 'KVNsys Server, with its database, dashboard, nightly backup and firewall rule. ' +
      'The location''s records are packed into one archive in ' + ArchiveFolder + ' first.' + NewLine;
  Result := Result + NewLine + 'KVNsys windows that are open are closed: a sale not yet paid is lost.' + NewLine +
    'Kept: the archives in ' + ArchiveFolder + '.';
end;

procedure RemoveApp;
var
  Exe, Parameters: String;
begin
  Doing('Closing and removing KVNsys POS & Inventory...');
  Run(Sys('taskkill.exe'), '/F /T /IM "' + AppProgram + '"');
  SplitCommand(AppUninstaller, Exe, Parameters);
  Run(Exe, Parameters);
  WaitForUninstaller('Registry::HKEY_CURRENT_USER\' + AppUninstallKey, Exe);
  if RegKeyExists(HKCU, AppUninstallKey) then
    Say('KVNsys POS & Inventory couldn''t be removed. Remove it from Windows'' Settings, Apps.')
  else
  begin
    Removed := True;
    Say('KVNsys POS & Inventory is removed, with its settings.');
  end;
end;

procedure RemoveHereCopy;
begin
  Doing('Removing the copy pnpm install:here made...');
  { Only what runs from that folder is closed, and only icons that open something in it are removed:
    the installed KVNsys Server's program has the same name. }
  PowerShell(
    '$here = ' + Quoted(HereCopy) + '; ' +
    'Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($here + ''\'', [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force; ' +
    '$shell = New-Object -ComObject WScript.Shell; ' +
    'Get-ChildItem -LiteralPath ([Environment]::GetFolderPath(''Desktop'')) -Filter *.lnk | ' +
    'Where-Object { $shell.CreateShortcut($_.FullName).TargetPath.StartsWith($here + ''\'', [StringComparison]::OrdinalIgnoreCase) } | Remove-Item -Force; ' +
    'Remove-Item -LiteralPath $here -Recurse -Force');
  if DirExists(HereCopy) then
    Say('Some of ' + HereCopy + ' couldn''t be removed; it can be deleted by hand.')
  else
  begin
    Removed := True;
    Say('The copy pnpm install:here made is removed, with its desktop icons.');
  end;
end;

procedure RemoveServer;
var
  Before: Integer;
begin
  Doing('Packing the location''s records into an archive and removing KVNsys Server...');
  Before := ArchiveCount;
  Run(ServerUninstaller, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART');
  WaitForUninstaller('Registry::HKEY_LOCAL_MACHINE\' + ServerUninstallKey, ServerUninstaller);
  if RegKeyExists(HKLM64, ServerUninstallKey) then
  begin
    Say('KVNsys Server couldn''t be removed. Remove it from Windows'' Settings, Apps; its own uninstaller packs the location''s records up first.');
    Exit;
  end;
  Removed := True;
  if not DirExists(DataFolder) then
    Say('KVNsys Server is removed. The location''s records were packed into one archive in ' + ArchiveFolder + ', then removed.')
  else if ArchiveCount > Before then
    Say('KVNsys Server is removed, and the location''s records were packed into one archive in ' + ArchiveFolder + '. Some files in ' +
      DataFolder + ' couldn''t be removed; the archive has them all, so that folder can be deleted by hand.')
  else
    Say('KVNsys Server is removed, but the location''s records couldn''t be packed into an archive, so they were left in ' +
      DataFolder + ' (its log in ' + DataFolder + '\Logs says why). The next KVNsys Server Setup packs them up ' +
      'before it starts a new location.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssInstall then Exit;
  { The app first, so nothing is still connected when the server goes. }
  if AppUninstaller <> '' then RemoveApp;
  if HereCopy <> '' then RemoveHereCopy;
  if ServerUninstaller <> '' then RemoveServer;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID <> wpFinished then Exit;
  if Removed then
    WizardForm.FinishedHeadingLabel.Caption := 'KVNsys is off this PC'
  else
    WizardForm.FinishedHeadingLabel.Caption := 'KVNsys couldn''t be removed';
  WizardForm.FinishedLabel.Caption := Outcome + #13#10#13#10 + 'To start fresh, run KVNsys Server Setup, then KVNsys POS & Inventory Setup.';
  WizardForm.AdjustLabelHeight(WizardForm.FinishedLabel);
end;
