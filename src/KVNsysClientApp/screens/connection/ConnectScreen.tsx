import type { ConnectResult } from '@kvnsys/client';
import { Button, Notice, Panel, TextField } from '@kvnsys/ui';
import { useState, type FormEvent } from 'react';

type State = { kind: 'idle' } | { kind: 'connecting' } | { kind: 'done'; result: ConnectResult };

/** The first screen: which KVNsys Server this register should use. */
export function ConnectScreen() {
  const [address, setAddress] = useState('');
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!address.trim()) {
      setMissing(true);
      return;
    }
    setState({ kind: 'connecting' });
    setState({ kind: 'done', result: await window.kvnsys.connectToServer(address) });
  }

  const connecting = state.kind === 'connecting';
  return (
    <Panel title="KVNsys POS & Inventory" subtitle="Connect this register to the shop's KVNsys Server.">
      <form onSubmit={connect} noValidate>
        <TextField
          label="Server address"
          placeholder="192.168.0.111"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setMissing(false);
          }}
          error={missing ? "Type the server's address first." : undefined}
          autoFocus
          spellCheck={false}
        />
        <Button type="submit" disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
      {state.kind === 'done' &&
        (state.result.ok ? (
          <Notice tone="good">
            Connected to KVNsys Server {state.result.server.version} at {state.result.server.address}.
          </Notice>
        ) : (
          <Notice tone="problem">{state.result.message}</Notice>
        ))}
    </Panel>
  );
}
