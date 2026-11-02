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
const ListCatalogChannel = 'kvnsys:list-catalog';
const CatalogEntryFormChannel = 'kvnsys:catalog-entry-form';
const SaveCatalogEntryChannel = 'kvnsys:save-catalog-entry';
const ListProductsChannel = 'kvnsys:list-products';
const ProductFormChannel = 'kvnsys:product-form';
const SaveProductChannel = 'kvnsys:save-product';
const ChooseProductPictureChannel = 'kvnsys:choose-product-picture';
const ProductThumbnailChannel = 'kvnsys:product-thumbnail';
const ListUsersChannel = 'kvnsys:list-users';
const UserFormChannel = 'kvnsys:user-form';
const SaveUserChannel = 'kvnsys:save-user';
const ResetPasswordChannel = 'kvnsys:reset-password';
const ListRolesChannel = 'kvnsys:list-roles';
const RoleFormChannel = 'kvnsys:role-form';
const SaveRoleChannel = 'kvnsys:save-role';
const ListInventoryChannel = 'kvnsys:list-inventory';
const FindInventoryItemChannel = 'kvnsys:find-inventory-item';
const ProductInventoryChannel = 'kvnsys:product-inventory';
const ReceiveDeliveryChannel = 'kvnsys:receive-delivery';
const RecordCountChannel = 'kvnsys:record-count';
const TillChannel = 'kvnsys:till';
const ScanForSaleChannel = 'kvnsys:scan-for-sale';
const SetSaleQuantityChannel = 'kvnsys:set-sale-quantity';
const RemoveFromSaleChannel = 'kvnsys:remove-from-sale';
const SetSaleDiscountChannel = 'kvnsys:set-sale-discount';
const ClearSaleChannel = 'kvnsys:clear-sale';
const PaySaleChannel = 'kvnsys:pay-sale';
const DaySalesChannel = 'kvnsys:day-sales';
const ReceiptChannel = 'kvnsys:receipt';
const ListMachinesChannel = 'kvnsys:list-machines';
const SaveMachineChannel = 'kvnsys:save-machine';
const ListAuditsChannel = 'kvnsys:list-audits';
const CurrentShiftChannel = 'kvnsys:current-shift';
const OpenShiftChannel = 'kvnsys:open-shift';
const CloseShiftChannel = 'kvnsys:close-shift';
const MySettingsChannel = 'kvnsys:my-settings';
const SaveMySettingsChannel = 'kvnsys:save-my-settings';

const bridge: KvnsysBridge = {
  connectToServer: (address, serverPassword) => ipcRenderer.invoke(ConnectChannel, address, serverPassword),
  savedServerAddress: () => ipcRenderer.invoke(SavedAddressChannel),
  signIn: (username, password) => ipcRenderer.invoke(SignInChannel, username, password),
  signOut: () => ipcRenderer.invoke(SignOutChannel),
  listCatalog: (list) => ipcRenderer.invoke(ListCatalogChannel, list),
  catalogEntryForm: (list, id) => ipcRenderer.invoke(CatalogEntryFormChannel, list, id),
  saveCatalogEntry: (list, id, form) => ipcRenderer.invoke(SaveCatalogEntryChannel, list, id, form),
  listProducts: () => ipcRenderer.invoke(ListProductsChannel),
  productForm: (id) => ipcRenderer.invoke(ProductFormChannel, id),
  saveProduct: (id, form) => ipcRenderer.invoke(SaveProductChannel, id, form),
  chooseProductPicture: () => ipcRenderer.invoke(ChooseProductPictureChannel),
  productThumbnail: (id) => ipcRenderer.invoke(ProductThumbnailChannel, id),
  listUsers: () => ipcRenderer.invoke(ListUsersChannel),
  userForm: (id) => ipcRenderer.invoke(UserFormChannel, id),
  saveUser: (id, form) => ipcRenderer.invoke(SaveUserChannel, id, form),
  resetPassword: (id, password, again) => ipcRenderer.invoke(ResetPasswordChannel, id, password, again),
  listRoles: () => ipcRenderer.invoke(ListRolesChannel),
  roleForm: (id) => ipcRenderer.invoke(RoleFormChannel, id),
  saveRole: (id, form) => ipcRenderer.invoke(SaveRoleChannel, id, form),
  listInventory: () => ipcRenderer.invoke(ListInventoryChannel),
  findInventoryItem: (codeOrBarcode) => ipcRenderer.invoke(FindInventoryItemChannel, codeOrBarcode),
  productInventory: (productId) => ipcRenderer.invoke(ProductInventoryChannel, productId),
  receiveDelivery: (lines, note) => ipcRenderer.invoke(ReceiveDeliveryChannel, lines, note),
  recordCount: (form) => ipcRenderer.invoke(RecordCountChannel, form),
  till: () => ipcRenderer.invoke(TillChannel),
  scanForSale: (codeOrBarcode) => ipcRenderer.invoke(ScanForSaleChannel, codeOrBarcode),
  setSaleQuantity: (productId, quantity) => ipcRenderer.invoke(SetSaleQuantityChannel, productId, quantity),
  removeFromSale: (productId) => ipcRenderer.invoke(RemoveFromSaleChannel, productId),
  setSaleDiscount: (discount) => ipcRenderer.invoke(SetSaleDiscountChannel, discount),
  clearSale: () => ipcRenderer.invoke(ClearSaleChannel),
  paySale: (tendered) => ipcRenderer.invoke(PaySaleChannel, tendered),
  daySales: (date) => ipcRenderer.invoke(DaySalesChannel, date),
  receipt: (id) => ipcRenderer.invoke(ReceiptChannel, id),
  listMachines: () => ipcRenderer.invoke(ListMachinesChannel),
  saveMachine: (id, form) => ipcRenderer.invoke(SaveMachineChannel, id, form),
  listAudits: (filter) => ipcRenderer.invoke(ListAuditsChannel, filter),
  currentShift: () => ipcRenderer.invoke(CurrentShiftChannel),
  openShift: (openingCash) => ipcRenderer.invoke(OpenShiftChannel, openingCash),
  closeShift: (countedCash, note) => ipcRenderer.invoke(CloseShiftChannel, countedCash, note),
  mySettings: () => ipcRenderer.invoke(MySettingsChannel),
  saveMySettings: (settings) => ipcRenderer.invoke(SaveMySettingsChannel, settings),
};

contextBridge.exposeInMainWorld('kvnsys', bridge);
