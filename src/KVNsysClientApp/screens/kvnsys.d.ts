import type { KvnsysBridge } from '../desktop/bridge.js';

declare global {
  interface Window {
    /** Handed to the screens by preload.cts. */
    kvnsys: KvnsysBridge;
  }
}
