import { ApiRequestError } from '@phoenix/api-client';
import { RegisterDeviceRequest, type LocationOption, type MachineSummary, type SessionUser } from '@phoenix/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { Alert, Field, PrimaryButton, Screen, SecondaryButton, Select, TextInput, Title } from './ui';

const RegisterRight = 'machines.register';

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Something went wrong. Try again.';
}

/**
 * Turns this browser into a register: a manager signs in, picks the location, names it,
 * and is signed out again so the register isn't left signed in as them.
 */
export function RegisterDevice({ onRegistered }: { onRegistered: (machine: MachineSummary) => void }) {
  const [manager, setManager] = useState<SessionUser | null>(null);
  return manager ? (
    <DeviceDetails manager={manager} onCancel={() => void api.signOut().finally(() => setManager(null))} onRegistered={onRegistered} />
  ) : (
    <ManagerSignIn onSignedIn={setManager} />
  );
}

function ManagerSignIn({ onSignedIn }: { onSignedIn: (user: SessionUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter a username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await api.signIn({ username, password });
      if (!user.accesses.includes(RegisterRight)) {
        await api.signOut();
        setError(`${user.displayName} can't register devices. A manager has to do this.`);
        return;
      }
      onSignedIn(user);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title hint="A manager registers it once. After that it's recognised every time it opens.">
        This device isn't registered
      </Title>
      <form onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Manager username">
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </Field>
        <Field label="Password">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
      </form>
    </Screen>
  );
}

type FieldErrors = Partial<Record<'locationId' | 'code' | 'name', string>>;

function DeviceDetails({
  manager,
  onCancel,
  onRegistered,
}: {
  manager: SessionUser;
  onCancel: () => void;
  onRegistered: (machine: MachineSummary) => void;
}) {
  const [locations, setLocations] = useState<LocationOption[] | null>(null);
  const [locationId, setLocationId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .locations()
      .then((list) => {
        setLocations(list);
        if (list.length === 1) setLocationId(list[0]!.id);
      })
      .catch((e: unknown) => setError(messageOf(e)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = RegisterDeviceRequest.safeParse({ locationId, code, name });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    try {
      const machine = await api.registerDevice(parsed.data);
      await api.signOut();
      onRegistered(machine);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title hint={`Signed in as ${manager.displayName}. You'll be signed out when this is done.`}>Register this device</Title>
      <form onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Location" error={fieldErrors.locationId}>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!locations}>
            <option value="">{locations ? 'Pick a location' : 'Loading…'}</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Code" error={fieldErrors.code}>
          <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FRONT-1" autoCapitalize="characters" />
        </Field>
        <Field label="Name" error={fieldErrors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Front counter 1" />
        </Field>
        <div className="grid gap-3">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? 'Registering…' : 'Register this device'}
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onCancel}>
            Cancel
          </SecondaryButton>
        </div>
      </form>
    </Screen>
  );
}
