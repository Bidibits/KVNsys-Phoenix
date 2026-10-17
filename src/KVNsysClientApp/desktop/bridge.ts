import type { ConnectResult } from '@kvnsys/client';

/**
 * What the screens may ask the desktop side to do, and nothing more. The screens can't reach the
 * network, the disk or the PC themselves: they ask through this, and the desktop side, where the
 * client engine runs, does it.
 */
export interface KvnsysBridge {
  connectToServer(address: string): Promise<ConnectResult>;
}

/** The message name the desktop side listens on. preload.cts repeats it; keep the two equal. */
export const ConnectChannel = 'kvnsys:connect-to-server';
