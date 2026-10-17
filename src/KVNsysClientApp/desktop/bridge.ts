import type { ConnectResult, SignedInUser, SignInResult } from '@kvnsys/client';

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
}

// The message names the desktop side listens on. preload.cts repeats them; keep them equal.
export const ConnectChannel = 'kvnsys:connect-to-server';
export const SavedAddressChannel = 'kvnsys:saved-server-address';
export const SignInChannel = 'kvnsys:sign-in';
export const SignOutChannel = 'kvnsys:sign-out';
