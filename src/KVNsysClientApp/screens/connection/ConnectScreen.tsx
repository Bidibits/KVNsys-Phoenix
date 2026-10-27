import { Button, Notice, Panel, TextField } from '@kvnsys/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConnectReply } from '../../desktop/bridge.js';

export type Connected = Extract<ConnectReply, { ok: true }>;

/**
 * Which KVNsys Server this register should use. If this PC remembers one and `autoConnect` is on,
 * it connects straight away; otherwise it waits for an address. A server with a password asks for
 * it here, once: the register remembers it after that. `problem` arrives with the screen when it
 * was shown again because something changed, such as the server's password.
 */
export function ConnectScreen({
  autoConnect,
  problem: shownWith = null,
  askServerPassword = false,
  onConnected,
}: {
  autoConnect: boolean;
  problem?: string | null;
  askServerPassword?: boolean;
  onConnected: (connected: Connected) => void;
}) {
  const [address, setAddress] = useState('');
  const [serverPassword, setServerPassword] = useState('');
  const [askPassword, setAskPassword] = useState(askServerPassword);
  const [missing, setMissing] = useState({ address: false, serverPassword: false });
  const [connecting, setConnecting] = useState(false);
  const [problem, setProblem] = useState<string | null>(shownWith);
  const started = useRef(false);

  async function connectTo(target: string, password?: string) {
    setConnecting(true);
    setProblem(null);
    const reply = await window.kvnsys.connectToServer(target, password);
    setConnecting(false);
    if (reply.ok) {
      onConnected(reply);
      return;
    }
    setProblem(reply.message);
    if (reply.reason === 'server-password') {
      setAskPassword(true);
      // A wrong password is typed again from scratch, never edited.
      setServerPassword('');
    }
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
    const gaps = { address: !address.trim(), serverPassword: askPassword && !serverPassword };
    setMissing(gaps);
    if (gaps.address || gaps.serverPassword) return;
    await connectTo(address, askPassword ? serverPassword : undefined);
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
            setMissing((m) => ({ ...m, address: false }));
          }}
          error={missing.address ? "Type the server's address first." : undefined}
          autoFocus={!askPassword}
          spellCheck={false}
        />
        {askPassword && (
          <TextField
            label="Server password"
            type="password"
            value={serverPassword}
            onChange={(event) => {
              setServerPassword(event.target.value);
              setMissing((m) => ({ ...m, serverPassword: false }));
            }}
            error={missing.serverPassword ? "Type the server's password." : undefined}
            // Focused when it appears, so the next thing typed goes in it.
            autoFocus
            autoComplete="off"
          />
        )}
        <Button type="submit" disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect'}
        </Button>
      </form>
      {problem && <Notice tone="problem">{problem}</Notice>}
    </Panel>
  );
}
