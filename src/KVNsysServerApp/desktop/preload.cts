// Runs inside the window before the screens load, and hands them the bridge: the only way the
// screens can ask the desktop side for anything. It's CommonJS (.cts) because Electron's sandboxed
// preload scripts can't be ES modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { DashboardBridge } from './bridge.js';

// Must equal the channels in bridge.ts. A sandboxed preload can't import them at run time.
const LookChannel = 'kvnsys-server:look';
const TurnOnChannel = 'kvnsys-server:turn-on';
const TurnOffChannel = 'kvnsys-server:turn-off';
const StartsWithPcChannel = 'kvnsys-server:starts-with-pc';
const StopOnCloseChannel = 'kvnsys-server:stop-on-close';
const DisconnectChannel = 'kvnsys-server:disconnect';
const SetServerPasswordChannel = 'kvnsys-server:set-server-password';
const TurnOffServerPasswordChannel = 'kvnsys-server:turn-off-server-password';
const OpenLogsChannel = 'kvnsys-server:open-logs';
const ClosingChannel = 'kvnsys-server:closing';

const bridge: DashboardBridge = {
  look: () => ipcRenderer.invoke(LookChannel),
  turnOn: () => ipcRenderer.invoke(TurnOnChannel),
  turnOff: () => ipcRenderer.invoke(TurnOffChannel),
  setStartsWithPc: (on) => ipcRenderer.invoke(StartsWithPcChannel, on),
  setStopOnClose: (on) => ipcRenderer.invoke(StopOnCloseChannel, on),
  disconnect: (id) => ipcRenderer.invoke(DisconnectChannel, id),
  setServerPassword: (password, again) => ipcRenderer.invoke(SetServerPasswordChannel, password, again),
  turnOffServerPassword: () => ipcRenderer.invoke(TurnOffServerPasswordChannel),
  openLogs: () => ipcRenderer.invoke(OpenLogsChannel),
  onClosing: (listener) => {
    ipcRenderer.on(ClosingChannel, (_event, closing) => listener(closing));
  },
};

contextBridge.exposeInMainWorld('kvnsys', bridge);
