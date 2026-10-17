import { ApiRequestError } from '@phoenix/api-client';
import type { MachineSummary } from '@phoenix/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { RegisterDevice } from './RegisterDevice';
import { PrimaryButton, Screen, Title } from './ui';

type DeviceState =
  | { kind: 'checking' }
  | { kind: 'unregistered' }
  | { kind: 'registered'; machine: MachineSummary }
  | { kind: 'unreachable'; message: string };

/**
 * The first thing every browser does: ask the server what it is. A register goes on to
 * selling (next milestone); anything else must be registered by a manager first.
 */
export function App() {
  const [state, setState] = useState<DeviceState>({ kind: 'checking' });

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      const status = await api.deviceStatus();
      setState(status.registered ? { kind: 'registered', machine: status.machine } : { kind: 'unregistered' });
    } catch (error) {
      setState({
        kind: 'unreachable',
        message: error instanceof ApiRequestError ? error.message : 'Something went wrong talking to the server.',
      });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  switch (state.kind) {
    case 'checking':
      return (
        <Screen>
          <p className="text-lg text-slate-600" aria-live="polite">
            Checking this device…
          </p>
        </Screen>
      );
    case 'unreachable':
      return (
        <Screen>
          <Title hint={state.message}>Can't reach the server</Title>
          <PrimaryButton onClick={() => void check()}>Try again</PrimaryButton>
        </Screen>
      );
    case 'unregistered':
      return <RegisterDevice onRegistered={(machine) => setState({ kind: 'registered', machine })} />;
    case 'registered':
      return <Registered machine={state.machine} />;
  }
}

function Registered({ machine }: { machine: MachineSummary }) {
  return (
    <Screen>
      <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Registered register</p>
      <h1 className="mt-1 text-3xl font-semibold">{machine.name}</h1>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-lg">
        <dt className="text-slate-500">Code</dt>
        <dd className="font-mono">{machine.code}</dd>
        <dt className="text-slate-500">Location</dt>
        <dd>
          {machine.location.name} <span className="text-slate-500">({machine.location.code})</span>
        </dd>
      </dl>
      <p className="mt-8 rounded-xl bg-slate-50 px-4 py-3 text-slate-600">
        This device is ready. Selling comes in the next milestone.
      </p>
    </Screen>
  );
}
