import type { SignedInUser } from '@kvnsys/client';
import { useState } from 'react';
import { ConnectScreen, type Connected } from './connection/ConnectScreen';
import { SignedInScreen } from './identity/SignedInScreen';
import { SignInScreen } from './identity/SignInScreen';

type Stage =
  | { kind: 'connect'; autoConnect: boolean }
  | { kind: 'sign-in'; connected: Connected }
  | { kind: 'signed-in'; connected: Connected; user: SignedInUser };

/** The way through the app so far: connect to the server, then sign in. */
export function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'connect', autoConnect: true });

  switch (stage.kind) {
    case 'connect':
      return (
        <ConnectScreen autoConnect={stage.autoConnect} onConnected={(connected) => setStage({ kind: 'sign-in', connected })} />
      );
    case 'sign-in':
      return (
        <SignInScreen
          connected={stage.connected}
          onSignedIn={(user) => setStage({ kind: 'signed-in', connected: stage.connected, user })}
          // Choosing another server mustn't bounce straight back to this one.
          onChangeServer={() => setStage({ kind: 'connect', autoConnect: false })}
        />
      );
    case 'signed-in':
      return (
        <SignedInScreen user={stage.user} onSignOut={() => setStage({ kind: 'sign-in', connected: stage.connected })} />
      );
  }
}
