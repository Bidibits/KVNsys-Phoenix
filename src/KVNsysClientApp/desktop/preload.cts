// Runs inside the window before the screens load, and hands them the bridge: the only way the
// screens can ask the desktop side for anything. It's CommonJS (.cts) because Electron's sandboxed
// preload scripts can't be ES modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { KvnsysBridge } from './bridge.js';

// Must equal the channels in bridge.ts. A sandboxed preload can't import them at run time.
const ConnectChannel = 'kvnsys:connect-to-server';
const SavedAddressChannel = 'kvnsys:saved-server-address';
const SignInChannel = 'kvnsys:sign-in';
const SignOutChannel = 'kvnsys:sign-out';
const ListProductsChannel = 'kvnsys:list-products';
const ProductFormChannel = 'kvnsys:product-form';
const SaveProductChannel = 'kvnsys:save-product';
const ListUsersChannel = 'kvnsys:list-users';
const UserFormChannel = 'kvnsys:user-form';
const SaveUserChannel = 'kvnsys:save-user';
const ResetPasswordChannel = 'kvnsys:reset-password';
const ListRolesChannel = 'kvnsys:list-roles';
const RoleFormChannel = 'kvnsys:role-form';
const SaveRoleChannel = 'kvnsys:save-role';
const ListStockChannel = 'kvnsys:list-stock';
const FindStockItemChannel = 'kvnsys:find-stock-item';
const ProductStockChannel = 'kvnsys:product-stock';
const ReceiveStockChannel = 'kvnsys:receive-stock';
const CountStockChannel = 'kvnsys:count-stock';
const TillChannel = 'kvnsys:till';
const ScanForSaleChannel = 'kvnsys:scan-for-sale';
const SetSaleQuantityChannel = 'kvnsys:set-sale-quantity';
const RemoveFromSaleChannel = 'kvnsys:remove-from-sale';
const SetSaleDiscountChannel = 'kvnsys:set-sale-discount';
const ClearSaleChannel = 'kvnsys:clear-sale';
const PaySaleChannel = 'kvnsys:pay-sale';
const DaySalesChannel = 'kvnsys:day-sales';
const ReceiptChannel = 'kvnsys:receipt';
const ListRegistersChannel = 'kvnsys:list-registers';
const SaveRegisterChannel = 'kvnsys:save-register';
const CurrentShiftChannel = 'kvnsys:current-shift';
const OpenShiftChannel = 'kvnsys:open-shift';
const CloseShiftChannel = 'kvnsys:close-shift';

const bridge: KvnsysBridge = {
  connectToServer: (address) => ipcRenderer.invoke(ConnectChannel, address),
  savedServerAddress: () => ipcRenderer.invoke(SavedAddressChannel),
  signIn: (username, password) => ipcRenderer.invoke(SignInChannel, username, password),
  signOut: () => ipcRenderer.invoke(SignOutChannel),
  listProducts: () => ipcRenderer.invoke(ListProductsChannel),
  productForm: (id) => ipcRenderer.invoke(ProductFormChannel, id),
  saveProduct: (id, form) => ipcRenderer.invoke(SaveProductChannel, id, form),
  listUsers: () => ipcRenderer.invoke(ListUsersChannel),
  userForm: (id) => ipcRenderer.invoke(UserFormChannel, id),
  saveUser: (id, form) => ipcRenderer.invoke(SaveUserChannel, id, form),
  resetPassword: (id, password, again) => ipcRenderer.invoke(ResetPasswordChannel, id, password, again),
  listRoles: () => ipcRenderer.invoke(ListRolesChannel),
  roleForm: (id) => ipcRenderer.invoke(RoleFormChannel, id),
  saveRole: (id, form) => ipcRenderer.invoke(SaveRoleChannel, id, form),
  listStock: () => ipcRenderer.invoke(ListStockChannel),
  findStockItem: (codeOrBarcode) => ipcRenderer.invoke(FindStockItemChannel, codeOrBarcode),
  productStock: (productId) => ipcRenderer.invoke(ProductStockChannel, productId),
  receiveStock: (lines, note) => ipcRenderer.invoke(ReceiveStockChannel, lines, note),
  countStock: (form) => ipcRenderer.invoke(CountStockChannel, form),
  till: () => ipcRenderer.invoke(TillChannel),
  scanForSale: (codeOrBarcode) => ipcRenderer.invoke(ScanForSaleChannel, codeOrBarcode),
  setSaleQuantity: (productId, quantity) => ipcRenderer.invoke(SetSaleQuantityChannel, productId, quantity),
  removeFromSale: (productId) => ipcRenderer.invoke(RemoveFromSaleChannel, productId),
  setSaleDiscount: (discount) => ipcRenderer.invoke(SetSaleDiscountChannel, discount),
  clearSale: () => ipcRenderer.invoke(ClearSaleChannel),
  paySale: (tendered) => ipcRenderer.invoke(PaySaleChannel, tendered),
  daySales: (date) => ipcRenderer.invoke(DaySalesChannel, date),
  receipt: (id) => ipcRenderer.invoke(ReceiptChannel, id),
  listRegisters: () => ipcRenderer.invoke(ListRegistersChannel),
  saveRegister: (id, form) => ipcRenderer.invoke(SaveRegisterChannel, id, form),
  currentShift: () => ipcRenderer.invoke(CurrentShiftChannel),
  openShift: (openingCash) => ipcRenderer.invoke(OpenShiftChannel, openingCash),
  closeShift: (countedCash, note) => ipcRenderer.invoke(CloseShiftChannel, countedCash, note),
};

contextBridge.exposeInMainWorld('kvnsys', bridge);
