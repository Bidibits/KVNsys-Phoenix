import type { SignedInUser } from '@kvnsys/client';
import { AppFrame } from '@kvnsys/ui';
import { useState } from 'react';
import { HomeScreen, type Area } from './home/HomeScreen';
import { ProductsScreen } from './products/ProductsScreen';
import { RolesScreen } from './roles/RolesScreen';
import { StockScreen } from './stock/StockScreen';
import { UsersScreen } from './users/UsersScreen';

const Titles: Record<Area | 'home', string> = { home: 'Home', products: 'Products', stock: 'Stock', users: 'Users', roles: 'Roles' };

/**
 * The app once someone is signed in: the frame, with Home or an area inside it. Signing out
 * cancels this register's pass at the server, then goes back to the sign-in screen.
 */
export function SignedIn({ user, onSignedOut }: { user: SignedInUser; onSignedOut: () => void }) {
  const [area, setArea] = useState<Area | 'home'>('home');
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
    <AppFrame
      title={Titles[area]}
      signedIn={{ name: user.displayName, username: user.username }}
      onHome={() => setArea('home')}
      onSignOut={() => void signOut()}
      signingOut={signingOut}
    >
      {area === 'home' && <HomeScreen user={user} onOpen={setArea} />}
      {/* The server has already ended this pass, so there's nothing left to sign out of. */}
      {area === 'products' && <ProductsScreen user={user} onSignInAgain={onSignedOut} />}
      {area === 'stock' && <StockScreen user={user} onSignInAgain={onSignedOut} />}
      {area === 'users' && <UsersScreen user={user} onSignInAgain={onSignedOut} />}
      {area === 'roles' && <RolesScreen user={user} onSignInAgain={onSignedOut} />}
    </AppFrame>
  );
}
