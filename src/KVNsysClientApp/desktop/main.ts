// KVNsys POS & Inventory: the desktop side. It opens the window and answers the screens'
// requests through the bridge. The client engine runs here, not in the screens.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectToServer } from '@kvnsys/client';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { ConnectChannel, SavedAddressChannel, type ConnectReply } from './bridge.js';
import { SettingsFile } from './settings-file.js';
import { TrustFile } from './trust-file.js';

const AppName = 'KVNsys POS & Inventory';

// Where this PC keeps the app's settings: Windows' usual place for the signed-in account. Tests
// point it at a throwaway folder, so they never touch a real register's settings.
if (process.env.KVNSYS_APP_DATA) app.setPath('userData', process.env.KVNSYS_APP_DATA);
const settings = new SettingsFile(join(app.getPath('userData'), 'settings.json'));
const trustFile = new TrustFile(join(app.getPath('userData'), 'trusted-servers.json'));

ipcMain.handle(SavedAddressChannel, (): string | null => settings.load().serverAddress ?? null);

ipcMain.handle(ConnectChannel, async (_event, typed: unknown): Promise<ConnectReply> => {
  // The screens are trusted no further than this: check what they send.
  if (typeof typed !== 'string' || typed.length > 200) {
    return { ok: false, reason: 'bad-address', message: "That isn't a server address." };
  }

  // Read fresh every time, so IT resetting the file takes effect without restarting the app.
  const trusted = trustFile.read();
  if (!trusted.ok) return { ok: false, reason: 'not-trusted', message: trusted.message };

  let result;
  try {
    result = await connectToServer(typed, {
      trust: {
        pinFor: (address) => trusted.servers[address] ?? null,
        remember: (address, pin) => trustFile.remember(address, pin, trusted.servers),
      },
    });
  } catch (error) {
    // Only an unexpected failure on this PC gets here, such as being unable to save the trust.
    console.error('Connecting failed on this register:', error);
    return {
      ok: false,
      reason: 'unreachable',
      message: `Something went wrong on this register while connecting: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // A failed attempt never replaces the address that worked: the server may just be off.
  if (!result.ok) return result;
  try {
    settings.save({ ...settings.load(), serverAddress: result.server.address });
    return { ...result, remembered: true };
  } catch (error) {
    console.error(`Couldn't save ${settings.path}:`, error);
    return { ...result, remembered: false };
  }
});

function openWindow(): void {
  const window = new BrowserWindow({
    title: AppName,
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#eef2f0',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // A register's window is the app, never a browser: it can't open new windows or wander off.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  // Shown once drawn, so it never flashes white.
  window.once('ready-to-show', () => window.show());
  void window.loadFile(fileURLToPath(new URL('../screens/index.html', import.meta.url)));
}

// No File/Edit/View menu: nothing about it should look like a browser.
Menu.setApplicationMenu(null);

// Not `await app.whenReady()` at the top level: that holds this file open until Electron is
// ready, and anything that delays "ready" (Playwright does, in tests) then waits forever.
void app.whenReady().then(openWindow);
app.on('window-all-closed', () => app.quit());
