import type { AccessName, SignedInUser } from '@kvnsys/client';
import { Tile } from '@kvnsys/ui';

/**
 * The areas Home opens: seven tiles. The catalogue's four lists open from inside Products, and Roles
 * from inside Users, as Beta's Products dashboard had them (design-direction.md, rule 4).
 */
export type Area = 'transact' | 'sales' | 'products' | 'inventory' | 'users' | 'machines' | 'audits';

const Areas: { area: Area; title: string; description: string; right: AccessName; cannot: string }[] = [
  {
    area: 'transact',
    title: 'Transact',
    description: 'Ring up a sale: scan, discount, take cash, give change.',
    right: 'sales.sell',
    cannot: "Your role can't ring up sales. Ask a manager.",
  },
  {
    area: 'sales',
    title: 'Sales',
    description: "A day's receipts and what they came to, and any receipt again.",
    right: 'sales.view',
    cannot: "Your role can't see sales. Ask a manager.",
  },
  {
    area: 'products',
    title: 'Products',
    description: 'Every product, with its code, barcode and price, and the brands, categories, manufacturers and suppliers.',
    right: 'products.view',
    cannot: "Your role can't see products. Ask a manager.",
  },
  {
    area: 'inventory',
    title: 'Inventory',
    description: 'How many of each product the location has, deliveries in, and counts put right.',
    right: 'inventory.view',
    cannot: "Your role can't see the inventory. Ask a manager.",
  },
  {
    area: 'users',
    title: 'Users',
    description: 'Who can sign in, with which role, and what each role may do.',
    right: 'users.view',
    cannot: "Your role can't see users. Ask a manager.",
  },
  {
    area: 'machines',
    title: 'Machines',
    description: 'The PCs people sign in at, and what each is called.',
    right: 'machines.view',
    cannot: "Your role can't see machines. Ask a manager.",
  },
  {
    area: 'audits',
    title: 'Audit log',
    description: 'Every change saved: what it was before and after, who made it, when and where.',
    right: 'audits.view',
    cannot: "Your role can't see the audit log. Ask a manager.",
  },
];

/** Home: one tile per area, greyed out where the person's role lacks the right. */
export function HomeScreen({ user, onOpen }: { user: SignedInUser; onOpen: (area: Area) => void }) {
  return (
    <nav aria-label="Areas" className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
      {Areas.map((tile) => (
        <Tile
          key={tile.area}
          title={tile.title}
          description={tile.description}
          unavailable={user.rights.includes(tile.right) ? undefined : tile.cannot}
          onOpen={() => onOpen(tile.area)}
        />
      ))}
    </nav>
  );
}
