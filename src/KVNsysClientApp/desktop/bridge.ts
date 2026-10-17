import type { ConnectResult, SignInResult } from '@kvnsys/client';

/**
 * A connect result, plus whether this PC managed to save the address for next time. It's only
 * set after a successful connect, because a failed attempt never replaces the saved address.
 */
export type ConnectReply = ConnectResult & { remembered?: boolean };

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
  signIn(username: string, password: string): Promise<SignInResult>;
}

// The message names the desktop side listens on. preload.cts repeats them; keep them equal.
export const ConnectChannel = 'kvnsys:connect-to-server';
export const SavedAddressChannel = 'kvnsys:saved-server-address';
export const SignInChannel = 'kvnsys:sign-in';
