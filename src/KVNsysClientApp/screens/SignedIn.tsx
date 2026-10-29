import type { SignedInUser } from '@kvnsys/client';
import { AppFrame, ToastProvider } from '@kvnsys/ui';
import { useState } from 'react';
import { AuditLogScreen } from './audits/AuditLogScreen';
import { CatalogListScreen } from './catalog/CatalogListScreen';
import { HomeScreen, type Area } from './home/HomeScreen';
import { ProductsScreen } from './products/ProductsScreen';
import { RegistersScreen } from './registers/RegistersScreen';
import { RolesScreen } from './roles/RolesScreen';
import { SalesScreen } from './selling/SalesScreen';
import { SellScreen } from './selling/SellScreen';
import { StockScreen } from './stock/StockScreen';
import { UsersScreen } from './users/UsersScreen';

type Place = Area | 'home';

const Titles: Record<Place, string> = {
  home: 'Home',
  sell: 'Sell',
  sales: 'Sales',
  products: 'Products',
  suppliers: 'Suppliers',
  brands: 'Brands',
  manufacturers: 'Manufacturers',
  categories: 'Categories',
  stock: 'Stock',
  users: 'Users',
  roles: 'Roles',
  registers: 'Registers',
  audits: 'Audit log',
};

/** The screens with a list the title bar's search box filters. Sell has its own code box. */
const Searchable: ReadonlySet<Place> = new Set<Place>(['sales', 'products', 'suppliers', 'brands', 'manufacturers', 'categories', 'stock', 'users', 'roles', 'registers', 'audits']);

/**
 * Every screen opened, in order, and where Back and Forward have got to (design-direction.md,
 * rule 3). `visit` counts every arrival, so arriving at a screen, by Back or Forward or by opening
 * it again, always shows it fresh.
 */
interface History {
  places: Place[];
  at: number;
  visit: number;
}

/**
 * The app once someone is signed in: the frame, with Home or an area inside it, Back and Forward
 * through the screens opened, and the search box for the screen's list. Signing out cancels this
 * register's pass at the server, then goes back to the sign-in screen.
 */
export function SignedIn({ user, onSignedOut }: { user: SignedInUser; onSignedOut: () => void }) {
  const [history, setHistory] = useState<History>({ places: ['home'], at: 0, visit: 0 });
  const [search, setSearch] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const place = history.places[history.at]!;

  /** Opens a screen. Opening the one already open shows it fresh instead of piling up a copy. */
  function open(to: Place) {
    setSearch('');
    setHistory((h) => {
      if (h.places[h.at] === to) return { ...h, visit: h.visit + 1 };
      const places = [...h.places.slice(0, h.at + 1), to];
      return { places, at: places.length - 1, visit: h.visit + 1 };
    });
  }

  function step(by: -1 | 1) {
    setSearch('');
    setHistory((h) => ({ ...h, at: h.at + by, visit: h.visit + 1 }));
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await window.kvnsys.signOut();
    } finally {
      // Signed out either way: a server that can't be told lets the pass end on its own.
      onSignedOut();
    }
  }

  const screen = { onSignInAgain: onSignedOut, search };
  return (
    <ToastProvider>
      <AppFrame
        title={Titles[place]}
        signedIn={{ name: user.displayName, username: user.username, register: user.register?.name ?? null }}
        onHome={() => open('home')}
        onBack={history.at > 0 ? () => step(-1) : null}
        onForward={history.at < history.places.length - 1 ? () => step(1) : null}
        search={Searchable.has(place) ? { value: search, onChange: setSearch } : null}
        onSignOut={() => void signOut()}
        signingOut={signingOut}
      >
        {/* Keyed by the visit, so each arrival shows the screen fresh. */}
        <div key={history.visit} className="contents">
          {place === 'home' && <HomeScreen user={user} onOpen={open} />}
          {/* The server has already ended this pass, so there's nothing left to sign out of. */}
          {place === 'sell' && <SellScreen onSignInAgain={onSignedOut} />}
          {place === 'sales' && <SalesScreen {...screen} />}
          {place === 'products' && <ProductsScreen user={user} {...screen} />}
          {(place === 'suppliers' || place === 'brands' || place === 'manufacturers' || place === 'categories') && (
            <CatalogListScreen list={place} user={user} {...screen} />
          )}
          {place === 'stock' && <StockScreen user={user} {...screen} />}
          {place === 'users' && <UsersScreen user={user} {...screen} />}
          {place === 'roles' && <RolesScreen user={user} {...screen} />}
          {place === 'registers' && <RegistersScreen user={user} {...screen} />}
          {place === 'audits' && <AuditLogScreen {...screen} />}
        </div>
      </AppFrame>
    </ToastProvider>
  );
}
