// What the dashboard's screens may ask its desktop side, and the names of the messages that carry it.
import type { ControlProblem, ServerStatus } from '@kvnsys/server/control';
import type { ServiceState } from './service-state.js';

export const LookChannel = 'kvnsys-server:look';
export const TurnOnChannel = 'kvnsys-server:turn-on';
export const TurnOffChannel = 'kvnsys-server:turn-off';
export const StartsWithPcChannel = 'kvnsys-server:starts-with-pc';
export const StopOnCloseChannel = 'kvnsys-server:stop-on-close';
export const DisconnectChannel = 'kvnsys-server:disconnect';
export const SetServerPasswordChannel = 'kvnsys-server:set-server-password';
export const TurnOffServerPasswordChannel = 'kvnsys-server:turn-off-server-password';
export const OpenLogsChannel = 'kvnsys-server:open-logs';
/** From the desktop side to the screens: the window is closing, and the server is being turned off first. */
export const ClosingChannel = 'kvnsys-server:closing';

/** Done, or not, with the reason in words for the person at the dashboard. */
export type Done = { ok: true } | { ok: false; message: string };

/** Everything the dashboard shows, read fresh each time. */
export interface DashboardView {
  service:
    | { ok: true; state: ServiceState; startsWithPc: boolean }
    /** Windows couldn't be asked, or gave an answer that made no sense. */
    | { ok: false; message: string };
  /** The running server's own answer, or why there isn't one (it's off, most likely). */
  server: { ok: true; status: ServerStatus } | { ok: false; reason: ControlProblem; message: string };
  /** The port registers reach the server on, from its settings: shown even while it's off. */
  port: number;
  /** This PC's addresses on the shop's network. */
  addresses: string[];
  stopServerOnClose: boolean;
  /** False when this window was opened without administrator rights, so Windows will refuse it. */
  administrator: boolean;
}

/** Where closing has got to, when the server is turned off with the window. */
export type Closing = { stage: 'turning-off' } | { stage: 'failed'; message: string };

export interface DashboardBridge {
  look(): Promise<DashboardView>;
  turnOn(): Promise<Done>;
  turnOff(): Promise<Done>;
  setStartsWithPc(on: boolean): Promise<Done>;
  setStopOnClose(on: boolean): Promise<Done>;
  /** Ends one person's sign-in, by the id the dashboard was given. */
  disconnect(id: string): Promise<Done>;
  /** Sets a new server password, typed twice. */
  setServerPassword(password: string, again: string): Promise<Done>;
  turnOffServerPassword(): Promise<Done>;
  /** Opens the folder with the server's logs in Windows Explorer. */
  openLogs(): Promise<Done>;
  /** Called while the window closes with the server turning off, and if that fails. */
  onClosing(listener: (closing: Closing) => void): void;
}
