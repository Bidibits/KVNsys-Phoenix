import type { SignedInUser } from '@kvnsys/client';
import { Button, Panel } from '@kvnsys/ui';
import { useState } from 'react';

/**
 * Who's signed in. There's nothing to do here yet: selling comes next. Signing out cancels this
 * register's pass at the server, then goes back to the sign-in screen.
 */
export function SignedInScreen({ user, onSignedOut }: { user: SignedInUser; onSignedOut: () => void }) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await window.kvnsys.signOut();
    } finally {
      // Signed out either way: a server that can't be told lets the pass end on its own.
      onSignedOut();
    }
  }

  return (
    <Panel title="KVNsys POS & Inventory" subtitle="Selling comes next.">
      <p className="mb-5 text-[17px] leading-normal [&_strong]:font-semibold" role="status">
        Signed in as <strong>{user.displayName}</strong> ({user.username}, role {user.roleCode}).
      </p>
      <Button type="button" variant="secondary" onClick={() => void signOut()} disabled={signingOut}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </Panel>
  );
}
