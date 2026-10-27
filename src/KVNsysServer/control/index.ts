// @kvnsys/server/control: what the server's dashboard needs, and nothing more. It loads no NestJS
// and no database code, so the dashboard stays small and starts fast.
export {
  configuredPort,
  disconnectPerson,
  NoAccess,
  serverStatus,
  ServerIsOff,
  setServerPassword,
  turnOffServerPassword,
  type ControlAnswer,
  type ControlProblem,
} from './control-client.js';
export type { ConnectedPerson, ServerStatus } from './control-shapes.js';
export { lanAddresses } from './lan-addresses.js';
export { serverDataDir } from '../setup/server-folder.js';
