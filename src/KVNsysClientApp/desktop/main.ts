// KVNsys POS & Inventory: the desktop side. It opens the window and answers the screens'
// requests through the bridge. The client engine runs here, not in the screens.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectToServer,
  listProducts,
  loadProductForm,
  saveProductForm,
  signIn,
  signOut,
  type ProductCallOptions,
  type ProductForm,
  type ProductFormResult,
  type ProductListResult,
  type ProductResult,
  type ProductsProblem,
  type SessionPass,
} from '@kvnsys/client';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import {
  ConnectChannel,
  ListProductsChannel,
  ProductFormChannel,
  SaveProductChannel,
  SavedAddressChannel,
  SignInChannel,
  SignOutChannel,
  type ConnectReply,
  type SignInForScreens,
} from './bridge.js';
import { SettingsFile } from './settings-file.js';
import { TrustFile } from './trust-file.js';

const AppName = 'KVNsys POS & Inventory';

// Where this PC keeps the app's settings: Windows' usual place for the signed-in account. Tests
// point it at a throwaway folder, so they never touch a real register's settings.
if (process.env.KVNSYS_APP_DATA) app.setPath('userData', process.env.KVNSYS_APP_DATA);
const settings = new SettingsFile(join(app.getPath('userData'), 'settings.json'));
const trustFile = new TrustFile(join(app.getPath('userData'), 'trusted-servers.json'));

/** The server this register last connected to in this run. Sign-in only ever goes there. */
let connectedAddress: string | null = null;

/**
 * The pass from the current sign-in, and the server that gave it. It lives only here, in memory:
 * never handed to the screens, never written to disk. Closing the app drops it, and the server
 * forgets it within 12 hours.
 */
let session: { address: string; pass: SessionPass } | null = null;

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
  connectedAddress = result.server.address;
  try {
    settings.save({ ...settings.load(), serverAddress: result.server.address });
    return { ...result, remembered: true };
  } catch (error) {
    console.error(`Couldn't save ${settings.path}:`, error);
    return { ...result, remembered: false };
  }
});

ipcMain.handle(SignInChannel, async (_event, username: unknown, password: unknown): Promise<SignInForScreens> => {
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 200) {
    return { ok: false, reason: 'refused', message: 'Type a username and a password.' };
  }
  if (!connectedAddress) {
    return { ok: false, reason: 'not-connected', message: 'Connect to the server first.' };
  }
  const trusted = trustFile.read();
  if (!trusted.ok) return { ok: false, reason: 'not-trusted', message: trusted.message };
  // The password is used for this one request and kept nowhere: not logged, not stored.
  const result = await signIn(connectedAddress, { username, password }, { pin: trusted.servers[connectedAddress] ?? null });
  if (!result.ok) return result;
  session = { address: connectedAddress, pass: result.session };
  return { ok: true, user: result.user };
});

ipcMain.handle(SignOutChannel, async (): Promise<void> => {
  if (!session) return;
  const { address, pass } = session;
  // Forgotten here first: whatever the server says, this register is now signed out.
  session = null;
  const trusted = trustFile.read();
  const result = await signOut(address, pass, { pin: trusted.ok ? (trusted.servers[address] ?? null) : null });
  if (!result.ok) console.error(`Couldn't tell the server about the sign-out, so the pass will end on its own: ${result.message}`);
});

type Refused = { ok: false; reason: ProductsProblem; message: string };

/**
 * Runs a call that needs the signed-in pass, against the server that gave it. A pass the server
 * has ended is no use any more, so it's forgotten here too.
 */
async function withPass<T extends { ok: true } | Refused>(
  call: (address: string, pass: SessionPass, options: ProductCallOptions) => Promise<T>,
): Promise<T | Refused> {
  if (!session) return { ok: false, reason: 'ended', message: 'Sign in first.' };
  const { address, pass } = session;
  const trusted = trustFile.read();
  if (!trusted.ok) return { ok: false, reason: 'not-trusted', message: trusted.message };
  const result = await call(address, pass, { pin: trusted.servers[address] ?? null });
  if (!result.ok && (result as Refused).reason === 'ended' && session?.pass === pass) session = null;
  return result;
}

/** A product id from the screens, or null for a new product. Anything else isn't one. */
function asProductId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : undefined;
}

/** The form as the screens sent it: six pieces of text, none absurdly long, or nothing. */
function asProductForm(value: unknown): ProductForm | undefined {
  const fields = ['code', 'barcode', 'name', 'retailPrice', 'status', 'description'] as const;
  if (typeof value !== 'object' || value === null) return undefined;
  const form = value as Record<string, unknown>;
  if (!fields.every((field) => typeof form[field] === 'string' && (form[field] as string).length <= 2000)) return undefined;
  return Object.fromEntries(fields.map((field) => [field, form[field]])) as unknown as ProductForm;
}

const NotAForm: Refused = { ok: false, reason: 'refused', message: "The form didn't arrive whole. Close it and try again." };

ipcMain.handle(ListProductsChannel, (): Promise<ProductListResult> => withPass(listProducts));

ipcMain.handle(ProductFormChannel, async (_event, id: unknown): Promise<ProductFormResult> => {
  const productId = asProductId(id);
  if (productId === undefined) return NotAForm;
  return withPass((address, pass, options) => loadProductForm(address, pass, productId, options));
});

ipcMain.handle(SaveProductChannel, async (_event, id: unknown, typed: unknown): Promise<ProductResult> => {
  const productId = asProductId(id);
  const form = asProductForm(typed);
  if (productId === undefined || !form) return NotAForm;
  return withPass((address, pass, options) => saveProductForm(address, pass, productId, form, options));
});

function openWindow(): void {
  const window = new BrowserWindow({
    title: AppName,
    width: 1024,
    height: 720,
    minWidth: 720,
    minHeight: 520,
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
