import type { SignedInUser } from '@kvnsys/client';
import { Button, Notice, Panel, TextField } from '@kvnsys/ui';
import { useState, type FormEvent } from 'react';
import type { Connected } from '../connection/ConnectScreen';

/** Who's using this register. Shown once it's connected to its server. */
export function SignInScreen({
  connected,
  onSignedIn,
  onChangeServer,
  onServerPasswordNeeded,
}: {
  connected: Connected;
  onSignedIn: (user: SignedInUser) => void;
  onChangeServer: () => void;
  /** The server turned the sign-in down for want of its own password, which has changed: ask for it again. */
  onServerPasswordNeeded: (problem: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState({ username: false, password: false });
  const [signingIn, setSigningIn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { server, remembered } = connected;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const gaps = { username: !username.trim(), password: !password };
    setMissing(gaps);
    if (gaps.username || gaps.password) return;

    setSigningIn(true);
    setProblem(null);
    const result = await window.kvnsys.signIn(username, password);
    setSigningIn(false);
    if (result.ok) {
      onSignedIn(result.user);
    } else if (result.reason === 'server-password') {
      onServerPasswordNeeded(result.message);
    } else {
      setProblem(result.message);
      // A wrong password is typed again from scratch, never edited.
      setPassword('');
    }
  }

  return (
    <Panel title="KVNsys POS & Inventory" subtitle="Sign in to use this register.">
      <Notice tone="good">
        Connected to KVNsys Server {server.version} at {server.address}.
        {server.firstTrust && ' This register now trusts this server, and will refuse any other that tries to answer at this address.'}
        {remembered === false && " This PC couldn't save the address, so you'll need to type it again next time."}
      </Notice>
      {/* Above the fields, so it can never fall off the bottom of a short window unseen. */}
      {problem && <Notice tone="problem">{problem}</Notice>}
      <form onSubmit={submit} noValidate className="mt-4">
        <TextField
          label="Username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setMissing((m) => ({ ...m, username: false }));
          }}
          error={missing.username ? 'Type your username.' : undefined}
          autoFocus
          autoComplete="username"
          spellCheck={false}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setMissing((m) => ({ ...m, password: false }));
          }}
          error={missing.password ? 'Type your password.' : undefined}
          autoComplete="current-password"
        />
        <Button type="submit" disabled={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <Button type="button" variant="secondary" onClick={onChangeServer}>
        Use a different server
      </Button>
    </Panel>
  );
}
