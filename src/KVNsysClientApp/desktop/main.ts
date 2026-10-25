// KVNsys POS & Inventory: the desktop side. It opens the window and answers the screens'
// requests through the bridge. The client engine runs here, not in the screens.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  changeRegister,
  closeShift,
  connectToServer,
  currentShift,
  openShift,
  type CurrentShiftResult,
  type ShiftResult,
  findSaleProduct,
  listRegisters,
  readThisPc,
  type RegisterListResult,
  type RegisterResult,
  getReceipt,
  listDaySales,
  type DaySalesResult,
  recordSale,
  Till,
  type SaleResult,
  type StatutoryDiscount,
  type TillResult,
  findStockItem,
  getProductStock,
  listStock,
  saveCount,
  saveDelivery,
  type CountForm,
  type DeliveryLineForm,
  type ProductStockResult,
  type RecordStockResult,
  type StockItemResult,
  type StockListResult,
  CatalogLists,
  listCatalog,
  loadCatalogEntryForm,
  saveCatalogEntryForm,
  type CatalogEntryForm,
  type CatalogEntryFormResult,
  type CatalogEntryResult,
  type CatalogList,
  type CatalogListResult,
  getProductPicture,
  listProductRows,
  listRoles,
  listUsers,
  loadProductForm,
  loadRoleForm,
  loadUserForm,
  resetPassword,
  saveProductForm,
  saveRoleForm,
  saveUserForm,
  signIn,
  signOut,
  type PasswordResult,
  type RoleForm,
  type RoleFormResult,
  type RoleListResult,
  type RoleResult,
  type UserForm,
  type UserFormResult,
  type UserListResult,
  type UserResult,
  type ProductCallOptions,
  type ProductForm,
  type ProductFormResult,
  type ProductPictureResult,
  type ProductRowsResult,
  type ProductResult,
  type ProductsProblem,
  type SessionPass,
} from '@kvnsys/client';
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import {
  ClearSaleChannel,
  CloseShiftChannel,
  ConnectChannel,
  CurrentShiftChannel,
  OpenShiftChannel,
  ListRegistersChannel,
  SaveRegisterChannel,
  DaySalesChannel,
  ReceiptChannel,
  CountStockChannel,
  PaySaleChannel,
  RemoveFromSaleChannel,
  ScanForSaleChannel,
  SetSaleDiscountChannel,
  SetSaleQuantityChannel,
  TillChannel,
  FindStockItemChannel,
  ListStockChannel,
  ProductStockChannel,
  ReceiveStockChannel,
  CatalogEntryFormChannel,
  ListCatalogChannel,
  SaveCatalogEntryChannel,
  ListProductsChannel,
  ListRolesChannel,
  ListUsersChannel,
  ProductFormChannel,
  ResetPasswordChannel,
  RoleFormChannel,
  SaveProductChannel,
  ChooseProductPictureChannel,
  ProductThumbnailChannel,
  type PictureChoice,
  SaveRoleChannel,
  SaveUserChannel,
  UserFormChannel,
  SavedAddressChannel,
  SignInChannel,
  SignOutChannel,
  type ConnectReply,
  type SignInForScreens,
} from './bridge.js';
import { shrinkPicture, thumbnailOf } from './product-picture.js';
import { SettingsFile } from './settings-file.js';
import { TrustFile } from './trust-file.js';

const AppName = 'KVNsys POS & Inventory';

// Where this PC keeps the app's settings: Windows' usual place for the signed-in account. Tests
// point it at a throwaway folder, so they never touch a real register's settings.
if (process.env.KVNSYS_APP_DATA) app.setPath('userData', process.env.KVNSYS_APP_DATA);
const settings = new SettingsFile(join(app.getPath('userData'), 'settings.json'));
const trustFile = new TrustFile(join(app.getPath('userData'), 'trusted-servers.json'));

/** This PC, as it tells the server at every sign-in, so the server knows which register it's at. */
const thisPc = readThisPc();

/** The server this register last connected to in this run. Sign-in only ever goes there. */
let connectedAddress: string | null = null;

/**
 * The pass from the current sign-in, and the server that gave it. It lives only here, in memory:
 * never handed to the screens, never written to disk. Closing the app drops it, and the server
 * forgets it within 12 hours.
 */
let session: { address: string; pass: SessionPass } | null = null;

/** The sale being rung up on this register. Each sign-in, and each sign-out, starts an empty one. */
let till = new Till();

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
  const result = await signIn(connectedAddress, { username, password }, { pin: trusted.servers[connectedAddress] ?? null, register: thisPc });
  if (!result.ok) return result;
  session = { address: connectedAddress, pass: result.session };
  till = new Till();
  return { ok: true, user: result.user };
});

ipcMain.handle(SignOutChannel, async (): Promise<void> => {
  if (!session) return;
  const { address, pass } = session;
  // Forgotten here first: whatever the server says, this register is now signed out.
  session = null;
  till = new Till();
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

/** A record's id from the screens, or null for a new one. Anything else isn't one. */
function asProductId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : undefined;
}

/**
 * The form as the screens sent it: sixteen pieces of text, none absurdly long, two ticks, and a
 * picture's text no longer than one KVNsys keeps can be; or nothing.
 */
function asProductForm(value: unknown): ProductForm | undefined {
  const texts = [
    'code',
    'barcode',
    'name',
    'retailPrice',
    'status',
    'description',
    'categoryId',
    'brandId',
    'supplierId',
    'manufacturerId',
    'unitOfMeasure',
    'costPrice',
    'promoPrice',
    'wholesalePrice',
    'wholesaleQuantity',
    'warrantyMonths',
  ] as const;
  const ticks = ['tracksStock', 'hasWarranty'] as const;
  if (typeof value !== 'object' || value === null) return undefined;
  const form = value as Record<string, unknown>;
  if (!texts.every((field) => typeof form[field] === 'string' && (form[field] as string).length <= 2000)) return undefined;
  if (!ticks.every((field) => typeof form[field] === 'boolean')) return undefined;
  if (typeof form.picture !== 'string' || form.picture.length > 400_000) return undefined;
  return Object.fromEntries([...texts, ...ticks, 'picture'].map((field) => [field, form[field]])) as unknown as ProductForm;
}

/** The account form as the screens sent it: eight pieces of text, none absurdly long, or nothing. */
function asUserForm(value: unknown): UserForm | undefined {
  const fields = ['username', 'firstName', 'middleName', 'lastName', 'roleId', 'status', 'password', 'passwordAgain'] as const;
  if (typeof value !== 'object' || value === null) return undefined;
  const form = value as Record<string, unknown>;
  if (!fields.every((field) => typeof form[field] === 'string' && (form[field] as string).length <= 2000)) return undefined;
  return Object.fromEntries(fields.map((field) => [field, form[field]])) as unknown as UserForm;
}

/** The role form as the screens sent it: a name and a status as text, and the names of the rights ticked. */
function asRoleForm(value: unknown): RoleForm | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { name, status, rights } = value as Record<string, unknown>;
  if (typeof name !== 'string' || name.length > 2000 || typeof status !== 'string' || status.length > 2000) return undefined;
  if (!Array.isArray(rights) || rights.length > 100 || !rights.every((right) => typeof right === 'string' && right.length <= 100)) return undefined;
  return { name, status, rights: [...(rights as string[])] };
}

const asText = (value: unknown): string | undefined => (typeof value === 'string' && value.length <= 2000 ? value : undefined);

/** A delivery's lines as the screens sent them: a product id, its name and the pieces as typed, for at most 500 lines. */
function asDeliveryLines(value: unknown): DeliveryLineForm[] | undefined {
  if (!Array.isArray(value) || value.length > 500) return undefined;
  const lines: DeliveryLineForm[] = [];
  for (const line of value as unknown[]) {
    if (typeof line !== 'object' || line === null) return undefined;
    const { productId, name, pieces } = line as Record<string, unknown>;
    const id = asProductId(productId);
    if (!id || asText(name) === undefined || asText(pieces) === undefined) return undefined;
    lines.push({ productId: id, name: name as string, pieces: pieces as string });
  }
  return lines;
}

/** A count as the screens sent it: the product, the stock they showed, and two pieces of text. */
function asCountForm(value: unknown): CountForm | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { productId, onHand, counted, reason } = value as Record<string, unknown>;
  const id = asProductId(productId);
  if (!id || !Number.isSafeInteger(onHand) || asText(counted) === undefined || asText(reason) === undefined) return undefined;
  return { productId: id, onHand: onHand as number, counted: counted as string, reason: reason as string };
}

const NotAForm: Refused = { ok: false, reason: 'refused', message: "The form didn't arrive whole. Close it and try again." };

/** One of the catalogue's four lists, by name, or nothing. */
function asCatalogList(value: unknown): CatalogList | undefined {
  return (CatalogLists as readonly unknown[]).includes(value) ? (value as CatalogList) : undefined;
}

/** A list entry's form as the screens sent it: six pieces of text, none absurdly long, or nothing. */
function asCatalogEntryForm(value: unknown): CatalogEntryForm | undefined {
  const fields = ['code', 'name', 'address', 'parentId', 'status', 'description'] as const;
  if (typeof value !== 'object' || value === null) return undefined;
  const form = value as Record<string, unknown>;
  if (!fields.every((field) => typeof form[field] === 'string' && (form[field] as string).length <= 2000)) return undefined;
  return Object.fromEntries(fields.map((field) => [field, form[field]])) as unknown as CatalogEntryForm;
}

ipcMain.handle(ListCatalogChannel, async (_event, list: unknown): Promise<CatalogListResult> => {
  const which = asCatalogList(list);
  if (!which) return NotAForm;
  return withPass((address, pass, options) => listCatalog(address, pass, which, options));
});

ipcMain.handle(CatalogEntryFormChannel, async (_event, list: unknown, id: unknown): Promise<CatalogEntryFormResult> => {
  const which = asCatalogList(list);
  const entryId = asProductId(id);
  if (!which || entryId === undefined) return NotAForm;
  return withPass((address, pass, options) => loadCatalogEntryForm(address, pass, which, entryId, options));
});

ipcMain.handle(SaveCatalogEntryChannel, async (_event, list: unknown, id: unknown, typed: unknown): Promise<CatalogEntryResult> => {
  const which = asCatalogList(list);
  const entryId = asProductId(id);
  const form = asCatalogEntryForm(typed);
  if (!which || entryId === undefined || !form) return NotAForm;
  return withPass((address, pass, options) => saveCatalogEntryForm(address, pass, which, entryId, form, options));
});

ipcMain.handle(ListProductsChannel, (): Promise<ProductRowsResult> => withPass(listProductRows));

ipcMain.handle(ProductThumbnailChannel, async (_event, id: unknown): Promise<ProductPictureResult> => {
  const productId = asProductId(id);
  if (!productId) return NotAForm;
  const answer = await withPass((address, pass, options) => getProductPicture(address, pass, productId, options));
  if (!answer.ok || answer.picture === null) return answer;
  return { ok: true, picture: thumbnailOf(answer.picture) };
});

ipcMain.handle(ProductFormChannel, async (_event, id: unknown): Promise<ProductFormResult> => {
  const productId = asProductId(id);
  if (productId === undefined) return NotAForm;
  return withPass((address, pass, options) => loadProductForm(address, pass, productId, options));
});

ipcMain.handle(ChooseProductPictureChannel, async (event): Promise<PictureChoice> => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: 'Choose a picture of the product',
    properties: ['openFile' as const],
    filters: [{ name: 'Pictures', extensions: ['jpg', 'jpeg', 'png'] }],
  };
  const chosen = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options));
  const path = chosen.filePaths[0];
  if (chosen.canceled || !path) return { ok: false, reason: 'cancelled' };
  return shrinkPicture(path);
});

ipcMain.handle(SaveProductChannel, async (_event, id: unknown, typed: unknown): Promise<ProductResult> => {
  const productId = asProductId(id);
  const form = asProductForm(typed);
  if (productId === undefined || !form) return NotAForm;
  return withPass((address, pass, options) => saveProductForm(address, pass, productId, form, options));
});

ipcMain.handle(ListUsersChannel, (): Promise<UserListResult> => withPass(listUsers));

ipcMain.handle(UserFormChannel, async (_event, id: unknown): Promise<UserFormResult> => {
  const userId = asProductId(id);
  if (userId === undefined) return NotAForm;
  return withPass((address, pass, options) => loadUserForm(address, pass, userId, options));
});

ipcMain.handle(SaveUserChannel, async (_event, id: unknown, typed: unknown): Promise<UserResult> => {
  const userId = asProductId(id);
  const form = asUserForm(typed);
  if (userId === undefined || !form) return NotAForm;
  return withPass((address, pass, options) => saveUserForm(address, pass, userId, form, options));
});

ipcMain.handle(ResetPasswordChannel, async (_event, id: unknown, password: unknown, again: unknown): Promise<PasswordResult> => {
  const userId = asProductId(id);
  const first = asText(password);
  const second = asText(again);
  if (!userId || first === undefined || second === undefined) return NotAForm;
  // The new password is used for this one request and kept nowhere: not logged, not stored.
  return withPass((address, pass, options) => resetPassword(address, pass, userId, first, second, options));
});

ipcMain.handle(ListRolesChannel, (): Promise<RoleListResult> => withPass(listRoles));

ipcMain.handle(RoleFormChannel, async (_event, id: unknown): Promise<RoleFormResult> => {
  const roleId = asProductId(id);
  if (roleId === undefined) return NotAForm;
  return withPass((address, pass, options) => loadRoleForm(address, pass, roleId, options));
});

ipcMain.handle(SaveRoleChannel, async (_event, id: unknown, typed: unknown): Promise<RoleResult> => {
  const roleId = asProductId(id);
  const form = asRoleForm(typed);
  if (roleId === undefined || !form) return NotAForm;
  return withPass((address, pass, options) => saveRoleForm(address, pass, roleId, form, options));
});

ipcMain.handle(ListStockChannel, (): Promise<StockListResult> => withPass(listStock));

ipcMain.handle(FindStockItemChannel, async (_event, typed: unknown): Promise<StockItemResult> => {
  const codeOrBarcode = asText(typed);
  if (codeOrBarcode === undefined) return NotAForm;
  return withPass((address, pass, options) => findStockItem(address, pass, codeOrBarcode, options));
});

ipcMain.handle(ProductStockChannel, async (_event, id: unknown): Promise<ProductStockResult> => {
  const productId = asProductId(id);
  if (!productId) return NotAForm;
  return withPass((address, pass, options) => getProductStock(address, pass, productId, options));
});

ipcMain.handle(ReceiveStockChannel, async (_event, typed: unknown, note: unknown): Promise<RecordStockResult> => {
  const lines = asDeliveryLines(typed);
  const shared = asText(note);
  if (!lines || shared === undefined) return NotAForm;
  return withPass((address, pass, options) => saveDelivery(address, pass, lines, shared, options));
});

ipcMain.handle(CountStockChannel, async (_event, typed: unknown): Promise<RecordStockResult> => {
  const form = asCountForm(typed);
  if (!form) return NotAForm;
  return withPass((address, pass, options) => saveCount(address, pass, form, options));
});

/** A senior/PWD discount as the screens sent it: a kind and two pieces of text, or null to take it off. */
function asDiscount(value: unknown): StatutoryDiscount | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const { kind, idNumber, customerName } = value as Record<string, unknown>;
  if (asText(kind) === undefined || asText(idNumber) === undefined || asText(customerName) === undefined) return undefined;
  return { kind: kind as StatutoryDiscount['kind'], idNumber: idNumber as string, customerName: customerName as string };
}

ipcMain.handle(TillChannel, (): TillResult => ({ ok: true, till: till.view() }));

ipcMain.handle(ScanForSaleChannel, async (_event, typed: unknown): Promise<TillResult> => {
  const codeOrBarcode = asText(typed);
  if (codeOrBarcode === undefined) return NotAForm;
  const current = till;
  return current.scan(() => withPass((address, pass, options) => findSaleProduct(address, pass, codeOrBarcode, options)));
});

ipcMain.handle(SetSaleQuantityChannel, (_event, id: unknown, quantity: unknown): TillResult => {
  const productId = asProductId(id);
  if (!productId || typeof quantity !== 'number') return NotAForm;
  return till.setQuantity(productId, quantity);
});

ipcMain.handle(RemoveFromSaleChannel, (_event, id: unknown): TillResult => {
  const productId = asProductId(id);
  if (!productId) return NotAForm;
  return till.remove(productId);
});

ipcMain.handle(SetSaleDiscountChannel, (_event, typed: unknown): TillResult => {
  const discount = asDiscount(typed);
  if (discount === undefined) return NotAForm;
  return till.setDiscount(discount);
});

ipcMain.handle(ClearSaleChannel, (): TillResult => ({ ok: true, till: till.clear() }));

ipcMain.handle(PaySaleChannel, async (_event, typed: unknown): Promise<SaleResult> => {
  const tendered = asText(typed);
  if (tendered === undefined) return NotAForm;
  const current = till;
  return current.pay(tendered, (form) => withPass((address, pass, options) => recordSale(address, pass, form, options)));
});

ipcMain.handle(DaySalesChannel, async (_event, date: unknown): Promise<DaySalesResult> => {
  const day = date === null ? null : asText(date);
  if (day === undefined) return NotAForm;
  return withPass((address, pass, options) => listDaySales(address, pass, day, options));
});

ipcMain.handle(ReceiptChannel, async (_event, id: unknown): Promise<SaleResult> => {
  const receiptId = asProductId(id);
  if (!receiptId) return NotAForm;
  return withPass((address, pass, options) => getReceipt(address, pass, receiptId, options));
});

ipcMain.handle(ListRegistersChannel, (): Promise<RegisterListResult> => withPass(listRegisters));

ipcMain.handle(SaveRegisterChannel, async (_event, id: unknown, typed: unknown): Promise<RegisterResult> => {
  const registerId = asProductId(id);
  if (!registerId || typeof typed !== 'object' || typed === null) return NotAForm;
  const name = asText((typed as Record<string, unknown>).name);
  const status = asText((typed as Record<string, unknown>).status);
  if (name === undefined || status === undefined) return NotAForm;
  return withPass((address, pass, options) => changeRegister(address, pass, registerId, { name, status }, options));
});

ipcMain.handle(CurrentShiftChannel, (): Promise<CurrentShiftResult> => withPass(currentShift));

ipcMain.handle(OpenShiftChannel, async (_event, typed: unknown): Promise<ShiftResult> => {
  const openingCash = asText(typed);
  if (openingCash === undefined) return NotAForm;
  return withPass((address, pass, options) => openShift(address, pass, openingCash, options));
});

ipcMain.handle(CloseShiftChannel, async (_event, typed: unknown, note: unknown): Promise<ShiftResult> => {
  const countedCash = asText(typed);
  const written = asText(note);
  if (countedCash === undefined || written === undefined) return NotAForm;
  return withPass((address, pass, options) => closeShift(address, pass, countedCash, written, options));
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
