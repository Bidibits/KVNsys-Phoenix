import { networkInterfaces } from 'node:os';

/** This PC's addresses on the shop's network: the ones other PCs use to reach it. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a !== undefined && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}
