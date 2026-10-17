import { Button, Notice, Panel, TextField } from '@kvnsys/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConnectReply } from '../../desktop/bridge.js';

export type Connected = Extract<ConnectReply, { ok: true }>;

/**
 * Which KVNsys Server this register should use. If this PC remembers one and `autoConnect` is on,
 * it connects straight away; otherwise it waits for an address.
 */
export function ConnectScreen({
  autoConnect,
  onConnected,
}: {
  autoConnect: boolean;
  onConnected: (connected: Connected) => void;
}) {
  const [address, setAddress] = useState('');
  const [missing, setMissing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  async function connectTo(target: string) {
    setConnecting(true);
    setProblem(null);
    const reply = await window.kvnsys.connectToServer(target);
    setConnecting(false);
    if (reply.ok) onConnected(reply);
    else setProblem(reply.message);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void window.kvnsys.savedServerAddress().then((saved) => {
      if (!saved) return;
      setAddress(saved);
      if (autoConnect) void connectTo(saved);
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
      {problem && <Notice tone="problem">{problem}</Notice>}
    </Panel>
  );
}
