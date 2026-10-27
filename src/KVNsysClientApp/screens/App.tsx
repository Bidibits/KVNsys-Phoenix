import type { SignedInUser } from '@kvnsys/client';
import { useState } from 'react';
import { ConnectScreen, type Connected } from './connection/ConnectScreen';
import { SignInScreen } from './identity/SignInScreen';
import { SignedIn } from './SignedIn';

type Stage =
  | { kind: 'connect'; autoConnect: boolean; problem?: string; askServerPassword?: boolean }
  | { kind: 'sign-in'; connected: Connected }
  | { kind: 'signed-in'; connected: Connected; user: SignedInUser };

/** The way through the app: connect to the server, sign in, then the frame with Home. */
export function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'connect', autoConnect: true });

  switch (stage.kind) {
    case 'connect':
      return (
        <ConnectScreen
          autoConnect={stage.autoConnect}
          problem={stage.problem ?? null}
          askServerPassword={stage.askServerPassword ?? false}
          onConnected={(connected) => setStage({ kind: 'sign-in', connected })}
        />
      );
    case 'sign-in':
      return (
        <SignInScreen
          connected={stage.connected}
          onSignedIn={(user) => setStage({ kind: 'signed-in', connected: stage.connected, user })}
          // Choosing another server mustn't bounce straight back to this one.
          onChangeServer={() => setStage({ kind: 'connect', autoConnect: false })}
          // The server's password changed since this register connected: ask for the new one.
          onServerPasswordNeeded={(problem) => setStage({ kind: 'connect', autoConnect: false, problem, askServerPassword: true })}
        />
      );
    case 'signed-in':
      return <SignedIn user={stage.user} onSignedOut={() => setStage({ kind: 'sign-in', connected: stage.connected })} />;
  }
}
