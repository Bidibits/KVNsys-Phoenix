import type { SignedInUser } from '@kvnsys/client';
import { Button, Panel } from '@kvnsys/ui';

/**
 * Who's signed in. There's nothing to do here yet: selling comes next. Signing out only returns to
 * the sign-in screen, because the server doesn't keep sessions yet.
 */
export function SignedInScreen({ user, onSignOut }: { user: SignedInUser; onSignOut: () => void }) {
  return (
    <Panel title="KVNsys POS & Inventory" subtitle="Selling comes next.">
      <p className="kv-detail" role="status">
        Signed in as <strong>{user.displayName}</strong> ({user.username}, role {user.roleCode}).
      </p>
      <Button type="button" variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </Panel>
  );
}
