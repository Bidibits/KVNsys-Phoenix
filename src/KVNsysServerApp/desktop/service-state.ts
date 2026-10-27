// What Windows says about the server's service. In a file of its own, with no imports, because the
// screens share these types and can't load anything that reaches Node.

export type ServiceState = 'running' | 'stopped' | 'starting' | 'stopping' | 'not-installed';

export interface ServiceLook {
  state: ServiceState;
  /** True when Windows starts the server by itself whenever this PC starts. */
  startsWithPc: boolean;
}
