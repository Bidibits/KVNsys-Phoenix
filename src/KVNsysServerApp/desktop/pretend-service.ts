import { readFileSync, writeFileSync } from 'node:fs';
import type { ServiceControl, ServiceLook, ServiceState } from './windows-service.js';

/**
 * A stand-in for the Windows service, for the dashboard's own tests: its state is a small JSON
 * file the test reads and writes. Turning it on or off changes the file and nothing else. Only
 * used when KVNSYS_PRETEND_SERVICE names that file, which a real install never sets.
 */
export class PretendService implements ServiceControl {
  constructor(private readonly file: string) {}

  async look(): Promise<ServiceLook> {
    const saved = JSON.parse(readFileSync(this.file, 'utf8')) as { state?: ServiceState; startsWithPc?: boolean };
    return { state: saved.state ?? 'stopped', startsWithPc: saved.startsWithPc === true };
  }

  async start(): Promise<void> {
    await this.save({ state: 'running' });
  }

  async stop(): Promise<void> {
    await this.save({ state: 'stopped' });
  }

  async setStartsWithPc(on: boolean): Promise<void> {
    await this.save({ startsWithPc: on });
  }

  private async save(change: Partial<ServiceLook>): Promise<void> {
    writeFileSync(this.file, JSON.stringify({ ...(await this.look()), ...change }));
  }
}
