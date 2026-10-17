// Runs inside the window before the screens load, and hands them the bridge: the only way the
// screens can ask the desktop side for anything. It's CommonJS (.cts) because Electron's sandboxed
// preload scripts can't be ES modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { KvnsysBridge } from './bridge.js';

// Must equal ConnectChannel in bridge.ts. A sandboxed preload can't import it at run time.
const ConnectChannel = 'kvnsys:connect-to-server';

const bridge: KvnsysBridge = {
  connectToServer: (address) => ipcRenderer.invoke(ConnectChannel, address),
};

contextBridge.exposeInMainWorld('kvnsys', bridge);
