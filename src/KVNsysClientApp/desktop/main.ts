// KVNsys POS & Inventory: the desktop side. It opens the window and answers the screens'
// requests through the bridge. The client engine runs here, not in the screens.
import { fileURLToPath } from 'node:url';
import { connectToServer, type ConnectResult } from '@kvnsys/client';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { ConnectChannel } from './bridge.js';

const AppName = 'KVNsys POS & Inventory';

ipcMain.handle(ConnectChannel, async (_event, typed: unknown): Promise<ConnectResult> => {
  // The screens are trusted no further than this: check what they send.
  if (typeof typed !== 'string' || typed.length > 200) {
    return { ok: false, reason: 'bad-address', message: "That isn't a server address." };
  }
  return connectToServer(typed);
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
