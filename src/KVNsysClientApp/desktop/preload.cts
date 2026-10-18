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

const bridge: KvnsysBridge = {
  connectToServer: (address) => ipcRenderer.invoke(ConnectChannel, address),
  savedServerAddress: () => ipcRenderer.invoke(SavedAddressChannel),
  signIn: (username, password) => ipcRenderer.invoke(SignInChannel, username, password),
  signOut: () => ipcRenderer.invoke(SignOutChannel),
  listProducts: () => ipcRenderer.invoke(ListProductsChannel),
  productForm: (id) => ipcRenderer.invoke(ProductFormChannel, id),
  saveProduct: (id, form) => ipcRenderer.invoke(SaveProductChannel, id, form),
};

contextBridge.exposeInMainWorld('kvnsys', bridge);
