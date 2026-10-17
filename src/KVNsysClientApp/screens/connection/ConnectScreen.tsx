import { Button, Notice, Panel, TextField } from '@kvnsys/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConnectReply } from '../../desktop/bridge.js';

type State = { kind: 'idle' } | { kind: 'connecting' } | { kind: 'done'; result: ConnectReply };

/**
 * The first screen: which KVNsys Server this register should use. If this PC remembers one, it
 * connects to it straight away; otherwise it waits for an address.
 */
export function ConnectScreen() {
  const [address, setAddress] = useState('');
  const [missing, setMissing] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const started = useRef(false);

  async function connectTo(target: string) {
    setState({ kind: 'connecting' });
    setState({ kind: 'done', result: await window.kvnsys.connectToServer(target) });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void window.kvnsys.savedServerAddress().then((saved) => {
      if (!saved) return;
      setAddress(saved);
      void connectTo(saved);
    });
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (!address.trim()) {
      setMissing(true);
      return;
    }
    await connectTo(address);
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
            {state.result.remembered === false && " This PC couldn't save the address, so you'll need to type it again next time."}
          </Notice>
        ) : (
          <Notice tone="problem">{state.result.message}</Notice>
        ))}
    </Panel>
  );
}
