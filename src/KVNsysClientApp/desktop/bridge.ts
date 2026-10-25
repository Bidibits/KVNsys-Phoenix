import type {
  CatalogEntryForm,
  CatalogEntryFormResult,
  CatalogEntryResult,
  CatalogList,
  CatalogListResult,
  ConnectResult,
  CurrentShiftResult,
  DaySalesResult,
  ShiftResult,
  RegisterListResult,
  RegisterResult,
  SaleResult,
  StatutoryDiscount,
  TillResult,
  CountForm,
  DeliveryLineForm,
  ProductStockResult,
  RecordStockResult,
  StockItemResult,
  StockListResult,
  ProductForm,
  ProductFormResult,
  ProductListResult,
  PasswordResult,
  ProductResult,
  RoleForm,
  RoleFormResult,
  RoleListResult,
  RoleResult,
  SignedInUser,
  SignInResult,
  UserForm,
  UserFormResult,
  UserListResult,
  UserResult,
} from '@kvnsys/client';

/**
 * A connect result, plus whether this PC managed to save the address for next time. It's only
 * set after a successful connect, because a failed attempt never replaces the saved address.
 */
export type ConnectReply = ConnectResult & { remembered?: boolean };

/**
 * A sign-in result as the screens get it: who signed in, but not the pass. The pass proves who's
 * signed in, so it stays on the desktop side, out of the screens' reach.
 */
export type SignInForScreens = { ok: true; user: SignedInUser } | Extract<SignInResult, { ok: false }>;

/**
 * A picture chosen for a product, ready to keep: a small JPEG as base64 text. Or nothing, when
 * the person closed the window without choosing, or the reason the file won't do.
 */
export type PictureChoice =
  | { ok: true; picture: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'unreadable'; message: string };

/**
 * What the screens may ask the desktop side to do, and nothing more. The screens can't reach the
 * network, the disk or the PC themselves: they ask through this, and the desktop side, where the
 * client engine runs, does it.
 */
export interface KvnsysBridge {
  connectToServer(address: string): Promise<ConnectReply>;
  /** The address that last connected, if this PC remembers one. */
  savedServerAddress(): Promise<string | null>;
  /** Checks a username and password with the server this register is connected to. */
  signIn(username: string, password: string): Promise<SignInForScreens>;
  /** Cancels this register's pass at the server, and forgets it here. Always ends signed out. */
  signOut(): Promise<void>;
  /** Every entry in one of the catalogue's lists (suppliers, brands, manufacturers, categories), by name. */
  listCatalog(list: CatalogList): Promise<CatalogListResult>;
  /** A list entry's form: blank for a new one (null), or the entry as the server has it now, with what it can sit inside. */
  catalogEntryForm(list: CatalogList, id: string | null): Promise<CatalogEntryFormResult>;
  /** Saves what was typed, as a new entry (null) or over the one with that id. */
  saveCatalogEntry(list: CatalogList, id: string | null, form: CatalogEntryForm): Promise<CatalogEntryResult>;
  /** Every product, by name, if the signed-in person may see them. Prices are whole centavos. */
  listProducts(): Promise<ProductListResult>;
  /** The form to fill in: blank for a new product (null), or the product as the server has it now. */
  productForm(id: string | null): Promise<ProductFormResult>;
  /**
   * Saves what was typed, as a new product (null) or over the one with that id. The screens send
   * the text as typed; what it means (a price, a status) is decided here and at the server.
   */
  saveProduct(id: string | null, form: ProductForm): Promise<ProductResult>;
  /**
   * Asks the person to choose a picture file on this PC, and makes it what a product keeps (see
   * product-picture.ts). The screens never see the file itself, only the result.
   */
  chooseProductPicture(): Promise<PictureChoice>;
  /** Every account, by name, if the signed-in person may see them. */
  listUsers(): Promise<UserListResult>;
  /** The account form and the roles it can offer: blank for a new account (null), or the account as the server has it now. */
  userForm(id: string | null): Promise<UserFormResult>;
  /** Saves what was typed: a new account with its first password (null), or changes to one, never its password. */
  saveUser(id: string | null, form: UserForm): Promise<UserResult>;
  /** Gives an account a new password, typed twice. That person has to sign in again, wherever they are. */
  resetPassword(id: string, password: string, again: string): Promise<PasswordResult>;
  /** Every role, the Administrator first, if the signed-in person may see them. */
  listRoles(): Promise<RoleListResult>;
  /** The role form and its tick boxes: blank for a new role (null), or the role as the server has it now. */
  roleForm(id: string | null): Promise<RoleFormResult>;
  /** Saves what was typed and ticked, as a new role (null) or over the one with that id. */
  saveRole(id: string | null, form: RoleForm): Promise<RoleResult>;
  /** Every product, by name, with how many this shop has, if the signed-in person may see stock. */
  listStock(): Promise<StockListResult>;
  /** One product, by what was typed or scanned (its code or its barcode), with its stock here. */
  findStockItem(codeOrBarcode: string): Promise<StockItemResult>;
  /** One product's stock as the server has it now, and its newest movements. */
  productStock(productId: string): Promise<ProductStockResult>;
  /** Saves a delivery: each line's pieces as typed, and one note for all of it. All saved, or none. */
  receiveStock(lines: DeliveryLineForm[], note: string): Promise<RecordStockResult>;
  /** Puts a product's count right, from what was counted and what KVNsys showed when it was typed. */
  countStock(form: CountForm): Promise<RecordStockResult>;
  /** The sale being rung up on this register, priced. A new sign-in starts with an empty one. */
  till(): Promise<TillResult>;
  /** Finds what was scanned or typed and adds one to the sale. */
  scanForSale(codeOrBarcode: string): Promise<TillResult>;
  setSaleQuantity(productId: string, quantity: number): Promise<TillResult>;
  removeFromSale(productId: string): Promise<TillResult>;
  /** Gives the sale a senior/PWD discount, or takes it off (null). */
  setSaleDiscount(discount: StatutoryDiscount | null): Promise<TillResult>;
  /** Empties the sale without recording anything. */
  clearSale(): Promise<TillResult>;
  /** Records the sale, paid with the cash as typed; once it's recorded, the till starts a new sale. */
  paySale(tendered: string): Promise<SaleResult>;
  /** A day's receipts at the shop and their totals: "2026-10-24", or null for today by the shop's clock. */
  daySales(date: string | null): Promise<DaySalesResult>;
  /** One receipt as it was given. */
  receipt(id: string): Promise<SaleResult>;
  /** The shop's registers, the server PC first, if the signed-in person may see them. */
  listRegisters(): Promise<RegisterListResult>;
  /** Renames a register, or switches it off or on, as typed and picked. */
  saveRegister(id: string, form: { name: string; status: string }): Promise<RegisterResult>;
  /** The signed-in person's open shift, with its figures so far, or none. */
  currentShift(): Promise<CurrentShiftResult>;
  /** Starts a shift with the cash counted into the drawer, as typed. */
  openShift(openingCash: string): Promise<ShiftResult>;
  /** Ends the open shift with the cash counted out, as typed, and a note. */
  closeShift(countedCash: string, note: string): Promise<ShiftResult>;
}

// The message names the desktop side listens on. preload.cts repeats them; keep them equal.
export const ConnectChannel = 'kvnsys:connect-to-server';
export const SavedAddressChannel = 'kvnsys:saved-server-address';
export const SignInChannel = 'kvnsys:sign-in';
export const SignOutChannel = 'kvnsys:sign-out';
export const ListCatalogChannel = 'kvnsys:list-catalog';
export const CatalogEntryFormChannel = 'kvnsys:catalog-entry-form';
export const SaveCatalogEntryChannel = 'kvnsys:save-catalog-entry';
export const ListProductsChannel = 'kvnsys:list-products';
export const ProductFormChannel = 'kvnsys:product-form';
export const SaveProductChannel = 'kvnsys:save-product';
export const ChooseProductPictureChannel = 'kvnsys:choose-product-picture';
export const ListUsersChannel = 'kvnsys:list-users';
export const UserFormChannel = 'kvnsys:user-form';
export const SaveUserChannel = 'kvnsys:save-user';
export const ResetPasswordChannel = 'kvnsys:reset-password';
export const ListRolesChannel = 'kvnsys:list-roles';
export const RoleFormChannel = 'kvnsys:role-form';
export const SaveRoleChannel = 'kvnsys:save-role';
export const ListStockChannel = 'kvnsys:list-stock';
export const FindStockItemChannel = 'kvnsys:find-stock-item';
export const ProductStockChannel = 'kvnsys:product-stock';
export const ReceiveStockChannel = 'kvnsys:receive-stock';
export const CountStockChannel = 'kvnsys:count-stock';
export const TillChannel = 'kvnsys:till';
export const ScanForSaleChannel = 'kvnsys:scan-for-sale';
export const SetSaleQuantityChannel = 'kvnsys:set-sale-quantity';
export const RemoveFromSaleChannel = 'kvnsys:remove-from-sale';
export const SetSaleDiscountChannel = 'kvnsys:set-sale-discount';
export const ClearSaleChannel = 'kvnsys:clear-sale';
export const PaySaleChannel = 'kvnsys:pay-sale';
export const DaySalesChannel = 'kvnsys:day-sales';
export const ReceiptChannel = 'kvnsys:receipt';
export const ListRegistersChannel = 'kvnsys:list-registers';
export const SaveRegisterChannel = 'kvnsys:save-register';
export const CurrentShiftChannel = 'kvnsys:current-shift';
export const OpenShiftChannel = 'kvnsys:open-shift';
export const CloseShiftChannel = 'kvnsys:close-shift';
