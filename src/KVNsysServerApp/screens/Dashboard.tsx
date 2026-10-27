import { Button, ConfirmDialog, Notice, RecordTable, ShopTime, TickBox, useToast, type Column } from '@kvnsys/ui';
import type { ConnectedPerson } from '@kvnsys/server/control';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Closing, DashboardView, Done } from '../desktop/bridge.js';
import { Section } from './Section';
import { ServerPasswordSection } from './ServerPasswordSection';

/** How often the dashboard looks again while it's open. */
const LookEveryMs = 2000;

type Power = 'on' | 'off' | 'turning-on' | 'turning-off' | 'not-answering' | 'not-installed' | 'unknown';

const PowerWords: Record<Power, string> = {
  on: 'On',
  off: 'Off',
  'turning-on': 'Turning on…',
  'turning-off': 'Turning off…',
  'not-answering': 'Starting…',
  'not-installed': 'Not installed',
  unknown: 'Unknown',
};

/** What the server is doing, from Windows' answer and the server's own. */
function powerOf(view: DashboardView): Power {
  if (!view.service.ok) return 'unknown';
  switch (view.service.state) {
    case 'not-installed':
      return 'not-installed';
    case 'starting':
      return 'turning-on';
    case 'stopping':
      return 'turning-off';
    case 'stopped':
      return 'off';
    case 'running':
      if (view.server.ok) return 'on';
      // Windows has started it, but it isn't answering yet: still starting, or stuck. Or the
      // dashboard can't ask it at all, and then it can't tell.
      return view.server.reason === 'off' ? 'not-answering' : 'unknown';
  }
}

type Asking = { kind: 'turn-off'; connected: number } | { kind: 'disconnect'; person: ConnectedPerson };

/**
 * KVNsys Server's dashboard: is the server on, where registers reach it, who's connected, and the
 * server password. It looks again every two seconds while it's open.
 */
export function Dashboard() {
  const toast = useToast();
  const [view, setView] = useState<DashboardView | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [closing, setClosing] = useState<Closing | null>(null);
  const looking = useRef(false);

  const look = useCallback(async () => {
    if (looking.current) return;
    looking.current = true;
    try {
      setView(await window.kvnsys.look());
    } finally {
      looking.current = false;
    }
  }, []);

  useEffect(() => {
    let open = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = async () => {
      await look();
      if (open) timer = setTimeout(again, LookEveryMs);
    };
    void again();
    return () => {
      open = false;
      clearTimeout(timer);
    };
  }, [look]);

  useEffect(() => window.kvnsys.onClosing(setClosing), []);

  /** Runs one change, shows its problem if it has one, then looks again. */
  async function change(work: () => Promise<Done>, said?: string): Promise<boolean> {
    setWorking(true);
    setProblem(null);
    const result = await work();
    setWorking(false);
    if (!result.ok) setProblem(result.message);
    else if (said) toast(said);
    await look();
    return result.ok;
  }

  if (!view) {
    return (
      <Frame>
        <p className="text-[15px] text-muted-foreground">Looking at KVNsys Server…</p>
      </Frame>
    );
  }

  const power = powerOf(view);
  const status = view.server.ok ? view.server.status : null;
  const connected = status?.connected ?? [];
  const canSwitch = view.service.ok && view.service.state !== 'not-installed' && !working;
  // Which button to offer goes by what Windows says, whatever the server itself answers.
  const isOn = view.service.ok && (view.service.state === 'running' || view.service.state === 'starting');

  const turnOff = () => change(() => window.kvnsys.turnOff(), 'The server is off.');

  const columns: Column<ConnectedPerson>[] = [
    {
      heading: 'Name',
      wrap: true,
      cell: (person) => (
        <span>
          {person.displayName}
          <span className="ml-2 text-[13px] text-muted-foreground">{person.username}</span>
        </span>
      ),
    },
    { heading: 'Register', wrap: true, cell: (person) => (person.register ? person.register.name : 'No register') },
    { heading: 'Signed in', cell: (person) => <ShopTime at={person.since} show="time" /> },
    {
      heading: 'Disconnect',
      hiddenHeading: true,
      align: 'right',
      cell: (person) => (
        <Button type="button" size="compact" variant="secondary" onClick={() => setAsking({ kind: 'disconnect', person })}>
          Disconnect
        </Button>
      ),
    },
  ];

  return (
    <Frame version={status?.version}>
      {closing?.stage === 'turning-off' && (
        <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <p className="rounded-lg bg-card px-8 py-6 text-lg font-semibold shadow-lg">Turning the server off before closing…</p>
        </div>
      )}
      {closing?.stage === 'failed' && <Notice tone="problem">{closing.message}</Notice>}
      {!view.administrator && (
        <Notice tone="problem">
          This window isn't running as administrator, so Windows won't let it turn the server on or off, or show who's connected. Close
          it, and open KVNsys Server from its icon on the desktop.
        </Notice>
      )}
      {problem && <Notice tone="problem">{problem}</Notice>}

      {/* Side by side when there's room, so nothing needs scrolling to reach. */}
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Section title="The server">
          <div className="flex flex-wrap items-center gap-4">
            <span
              role="status"
              aria-label="The server is"
              className={`rounded-full px-4 py-1.5 text-lg font-semibold ${power === 'on' ? 'bg-success text-success-foreground' : 'bg-muted text-foreground'}`}
            >
              {PowerWords[power]}
            </span>
            {canSwitch &&
              (isOn ? (
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  onClick={() => (connected.length > 0 ? setAsking({ kind: 'turn-off', connected: connected.length }) : void turnOff())}
                >
                  Turn the server off
                </Button>
              ) : (
                <Button
                  type="button"
                  size="compact"
                  disabled={power === 'turning-off'}
                  onClick={() => void change(() => window.kvnsys.turnOn(), 'The server is on.')}
                >
                  Turn the server on
                </Button>
              ))}
            {working && <span className="text-[15px] text-muted-foreground">Asking Windows…</span>}
          </div>

          {!view.service.ok && <Notice tone="problem">{view.service.message}</Notice>}
        {/* Off is said by the label above. Anything else stopping the dashboard from asking the server is said here. */}
        {!view.server.ok && view.server.reason !== 'off' && !(view.server.reason === 'no-access' && !view.administrator) && (
          <Notice tone="problem">{view.server.message}</Notice>
        )}
          {power === 'not-installed' && (
            <Notice tone="problem">KVNsys Server isn't installed as a Windows service on this PC. Run KVNsys Server Setup.</Notice>
          )}
          {power === 'not-answering' && (
            <p className="mt-3 text-[15px] text-muted-foreground">
              Windows has started KVNsys Server, but it isn't answering yet. If this lasts more than a minute, open the logs folder to see
              why.
            </p>
          )}

          <div className="mt-4 grid gap-1 text-[15px]">
            <p>
              {isOn ? 'Registers connect to' : 'When it’s on, registers connect to'}{' '}
              {view.addresses.length === 0 ? (
                <span className="text-muted-foreground">this PC, once it's on the shop's network</span>
              ) : (
                view.addresses.map((address, index) => (
                  <span key={address}>
                    {index > 0 && ' or '}
                    <strong aria-label="Address">
                      {address}:{view.port}
                    </strong>
                  </span>
                ))
              )}
            </p>
            {status && (
              <p className="text-muted-foreground">
                On since <ShopTime at={status.startedAt} />
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-1">
            <TickBox
              label="Start the server when this PC starts"
              checked={view.service.ok && view.service.startsWithPc}
              disabled={!canSwitch}
              onChange={(on) =>
                void change(
                  () => window.kvnsys.setStartsWithPc(on),
                  on ? 'The server will start when this PC starts.' : "The server won't start by itself. Turn it on here.",
                )
              }
            />
            <TickBox
              label="Turn the server off when this window closes"
              checked={view.stopServerOnClose}
              disabled={working}
              onChange={(on) =>
                void change(
                  () => window.kvnsys.setStopOnClose(on),
                  on ? 'Closing this window will turn the server off.' : 'Closing this window leaves the server running.',
                )
              }
            />
          </div>
        </Section>

        <ServerPasswordSection view={view} serverIsOn={isOn} onChanged={() => void look()} />
      </div>

      <Section title="Connected">
        {!status ? (
          <p className="text-[15px] text-muted-foreground">
            {isOn ? "Who's connected shows here once the server answers." : 'The server is off, so nobody is connected.'}
          </p>
        ) : connected.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">Nobody is signed in right now.</p>
        ) : (
          <RecordTable label="Connected" columns={columns} rows={connected} rowKey={(person) => person.id} className="max-h-[320px]" />
        )}
      </Section>

      <div>
        <Button type="button" size="compact" variant="secondary" onClick={() => void change(() => window.kvnsys.openLogs())}>
          Open the logs folder
        </Button>
      </div>

      {asking?.kind === 'turn-off' && (
        <ConfirmDialog
          title="Turn the server off?"
          message={`${asking.connected === 1 ? 'One person is' : `${asking.connected} people are`} signed in. Their registers stop working until the server is on again, and a sale that isn't paid yet is lost.`}
          confirmLabel="Turn it off"
          onConfirm={() => {
            setAsking(null);
            void turnOff();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking?.kind === 'disconnect' && (
        <ConfirmDialog
          title={`Disconnect ${asking.person.displayName}?`}
          message={`They're signed out${asking.person.register ? ` at ${asking.person.register.name}` : ''} at once, and anything they haven't finished, such as a sale not yet paid, is lost. They can sign in again.`}
          confirmLabel="Disconnect"
          onConfirm={() => {
            const person = asking.person;
            setAsking(null);
            void change(() => window.kvnsys.disconnect(person.id), `${person.displayName} is disconnected.`);
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </Frame>
  );
}

/** The window: a title bar, and the sections under it. */
function Frame({ version, children }: { version?: string | undefined; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 bg-title-bar px-6 text-title-bar-foreground">
        <h1 className="text-xl font-semibold">KVNsys Server</h1>
        {version && <span className="text-sm opacity-80">version {version}</span>}
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto grid max-w-[920px] gap-5">{children}</div>
      </main>
    </div>
  );
}
