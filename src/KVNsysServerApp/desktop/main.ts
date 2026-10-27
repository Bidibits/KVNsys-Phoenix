// KVNsys Server's dashboard: the desktop side. It opens the window, turns the server's Windows
// service on and off, and asks the running server who's connected, through the server's own
// channel on this PC. The server keeps running when this window closes, unless the person at it
// ticked "Turn the server off when this window closes".
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configuredPort,
  disconnectPerson,
  lanAddresses,
  serverDataDir,
  serverStatus,
  setServerPassword,
  turnOffServerPassword,
  type ControlAnswer,
} from '@kvnsys/server/control';
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import {
  ClosingChannel,
  DisconnectChannel,
  LookChannel,
  OpenLogsChannel,
  SetServerPasswordChannel,
  StartsWithPcChannel,
  StopOnCloseChannel,
  TurnOffChannel,
  TurnOffServerPasswordChannel,
  TurnOnChannel,
  type Closing,
  type DashboardView,
  type Done,
} from './bridge.js';
import { loadDashboardSettings, saveDashboardSettings } from './dashboard-settings.js';
import { PretendService } from './pretend-service.js';
import { runsAsAdministrator, ServiceProblem, WindowsService, type ServiceControl } from './windows-service.js';

const AppName = 'KVNsys Server';

// Tests point these at throwaway folders and a stand-in service, so they never touch this PC's
// real server. A real install sets neither.
if (process.env.KVNSYS_APP_DATA) app.setPath('userData', process.env.KVNSYS_APP_DATA);
const dataDir = serverDataDir();
const service: ServiceControl = process.env.KVNSYS_PRETEND_SERVICE ? new PretendService(process.env.KVNSYS_PRETEND_SERVICE) : new WindowsService();

/** Where the server's service writes its logs: beside its own folder. */
const logsDir = join(dirname(dataDir), 'Logs');

/**
 * Asked once. A stand-in service needs no rights, so tests count as having them; and if Windows
 * can't be asked, the dashboard doesn't nag: its buttons say what's wrong when pressed.
 */
const administrator: Promise<boolean> = process.env.KVNSYS_PRETEND_SERVICE ? Promise.resolve(true) : runsAsAdministrator().catch(() => true);

function problemText(error: unknown): string {
  if (error instanceof ServiceProblem) return error.message;
  return `Something went wrong in this window: ${error instanceof Error ? error.message : String(error)}`;
}

async function done(work: () => Promise<unknown>): Promise<Done> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: problemText(error) };
  }
}

const fromServer = (answer: ControlAnswer<true>): Done => (answer.ok ? { ok: true } : { ok: false, message: answer.message });

const NotUnderstood: Done = { ok: false, message: "The request didn't arrive whole. Try again." };

ipcMain.handle(LookChannel, async (): Promise<DashboardView> => {
  const [serviceLook, server] = await Promise.all([
    service.look().then(
      (look) => ({ ok: true as const, ...look }),
      (error: unknown) => ({ ok: false as const, message: problemText(error) }),
    ),
    serverStatus(dataDir),
  ]);
  return {
    service: serviceLook,
    server: server.ok ? { ok: true, status: server.value } : server,
    port: server.ok ? server.value.port : configuredPort(dataDir),
    addresses: server.ok ? server.value.addresses : lanAddresses(),
    stopServerOnClose: loadDashboardSettings(dataDir).stopServerOnClose,
    administrator: await administrator,
  };
});

ipcMain.handle(TurnOnChannel, (): Promise<Done> => done(() => service.start()));
ipcMain.handle(TurnOffChannel, (): Promise<Done> => done(() => service.stop()));

ipcMain.handle(StartsWithPcChannel, (_event, on: unknown): Promise<Done> => {
  if (typeof on !== 'boolean') return Promise.resolve(NotUnderstood);
  return done(() => service.setStartsWithPc(on));
});

ipcMain.handle(StopOnCloseChannel, (_event, on: unknown): Done => {
  if (typeof on !== 'boolean') return NotUnderstood;
  try {
    saveDashboardSettings(dataDir, { ...loadDashboardSettings(dataDir), stopServerOnClose: on });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `Couldn't save that setting: ${error instanceof Error ? error.message : String(error)}` };
  }
});

ipcMain.handle(DisconnectChannel, async (_event, id: unknown): Promise<Done> => {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) return NotUnderstood;
  return fromServer(await disconnectPerson(dataDir, id));
});

ipcMain.handle(SetServerPasswordChannel, async (_event, password: unknown, again: unknown): Promise<Done> => {
  if (typeof password !== 'string' || typeof again !== 'string' || password.length > 200 || again.length > 200) return NotUnderstood;
  // Passed straight to the server, which keeps only a scrambled copy. Not logged, not kept here.
  return fromServer(await setServerPassword(dataDir, password, again));
});

ipcMain.handle(TurnOffServerPasswordChannel, async (): Promise<Done> => fromServer(await turnOffServerPassword(dataDir)));

ipcMain.handle(OpenLogsChannel, async (): Promise<Done> => {
  const failed = await shell.openPath(logsDir);
  return failed ? { ok: false, message: `Couldn't open ${logsDir}: ${failed}` } : { ok: true };
});

function openWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: AppName,
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    show: false,
    // Standard's surface grey (KVNsysUI's styles.css), so the window never flashes another colour.
    backgroundColor: '#e0e0e0',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // The dashboard is an app, never a browser: it can't open new windows or wander off.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  // Closing leaves the server running, unless the person at the dashboard chose otherwise. Then
  // the window waits for the server to be off before it goes, and stays open, saying why, if it
  // couldn't be turned off.
  let turningOff = false;
  let mayClose = false;
  window.on('close', (event) => {
    if (mayClose || !loadDashboardSettings(dataDir).stopServerOnClose) return;
    event.preventDefault();
    if (turningOff) return;
    turningOff = true;
    const tell = (closing: Closing) => window.webContents.send(ClosingChannel, closing);
    tell({ stage: 'turning-off' });
    service.stop().then(
      () => {
        mayClose = true;
        window.close();
      },
      (error: unknown) => {
        turningOff = false;
        tell({ stage: 'failed', message: `${problemText(error)} The window stayed open, and the server may still be on.` });
      },
    );
  });

  // Shown once drawn, so it never flashes white.
  window.once('ready-to-show', () => window.show());
  void window.loadFile(fileURLToPath(new URL('../screens/index.html', import.meta.url)));
  return window;
}

// No File/Edit/View menu: nothing about it should look like a browser.
Menu.setApplicationMenu(null);

// One dashboard at a time: opening it again brings the open one forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window: BrowserWindow | null = null;
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  // Not `await app.whenReady()` at the top level: that holds this file open until Electron is
  // ready, and anything that delays "ready" (Playwright does, in tests) then waits forever.
  void app.whenReady().then(() => {
    window = openWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
