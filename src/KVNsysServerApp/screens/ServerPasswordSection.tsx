import { Button, ConfirmDialog, Notice, TextField, useToast } from '@kvnsys/ui';
import { useState, type FormEvent } from 'react';
import type { DashboardView } from '../desktop/bridge.js';
import { Section } from './Section';

/**
 * The server password: off, on, or (rarely) damaged. It's kept by the running server, so it can
 * only be set, changed or turned off while the server is on.
 */
export function ServerPasswordSection({ view, serverIsOn, onChanged }: { view: DashboardView; serverIsOn: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const state = view.server.ok ? view.server.status.serverPassword : null;

  function close() {
    setEditing(false);
    setPassword('');
    setAgain('');
    setProblem(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    const result = await window.kvnsys.setServerPassword(password, again);
    setSaving(false);
    if (!result.ok) {
      setProblem(result.message);
      // Typed again from scratch, never edited.
      setPassword('');
      setAgain('');
      return;
    }
    close();
    toast(
      state === 'on'
        ? 'The server password is changed. Registers ask for the new one the next time they connect.'
        : 'The server password is on. Registers ask for it the next time they connect.',
    );
    onChanged();
  }

  async function turnOff() {
    setConfirmOff(false);
    const result = await window.kvnsys.turnOffServerPassword();
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    toast('The server password is off.');
    onChanged();
  }

  return (
    <Section title="Server password">
      {state === null && (
        <p className="text-[15px] text-muted-foreground">
          {serverIsOn
            ? 'The password can be set, changed or turned off once the server answers.'
            : 'Turn the server on to set, change or turn off its password.'}
        </p>
      )}
      {state === 'off' && (
        <p className="text-[15px]">
          <strong>Off.</strong> Any register on the shop's network can connect.
        </p>
      )}
      {state === 'on' && (
        <p className="text-[15px]">
          <strong>On.</strong> A register has to give the server password before anyone can sign in there. Registers that are
          already connected stay connected.
        </p>
      )}
      {state === 'damaged' && (
        <Notice tone="problem">The server password's file is damaged, so no register can connect. Set a new server password.</Notice>
      )}

      {problem && <Notice tone="problem">{problem}</Notice>}

      {editing ? (
        <form onSubmit={save} noValidate className="mt-4 max-w-[420px]">
          <TextField
            label={state === 'on' ? 'New server password' : 'Server password'}
            type="password"
            size="compact"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="new-password"
          />
          <TextField
            label="Type it again"
            type="password"
            size="compact"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
            autoComplete="new-password"
          />
          <p className="mb-3 text-[14px] text-muted-foreground">At least 8 characters. Each register asks for it once, then remembers it.</p>
          <div className="flex gap-3">
            <Button type="submit" size="compact" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" size="compact" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        state !== null && (
          <div className="mt-4 flex gap-3">
            <Button type="button" size="compact" variant={state === 'on' ? 'secondary' : 'primary'} onClick={() => setEditing(true)}>
              {state === 'on' ? 'Change it' : state === 'off' ? 'Set a server password' : 'Set a new server password'}
            </Button>
            {state !== 'off' && (
              <Button type="button" size="compact" variant="secondary" onClick={() => setConfirmOff(true)}>
                Turn it off
              </Button>
            )}
          </div>
        )
      )}

      {confirmOff && (
        <ConfirmDialog
          title="Turn the server password off?"
          message="Any register on the shop's network will be able to connect, without it."
          confirmLabel="Turn it off"
          onConfirm={() => void turnOff()}
          onCancel={() => setConfirmOff(false)}
        />
      )}
    </Section>
  );
}
