/** The code of a location's server PC: HQ-SRV, BR3-SRV. */
export function serverMachineCode(locationCode: string): string {
  return `${locationCode}-SRV`;
}

/** What a PC reports about itself: the KVNsys program on it can always read these. */
export interface PcIdentity {
  /** Windows MachineGuid. Null only if it couldn't be read. */
  hardwareId: string | null;
  computerName: string;
}
