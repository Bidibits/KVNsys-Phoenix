import type { AccessName, SignedInUser } from '@kvnsys/client';
import { Tile } from '@kvnsys/ui';

/** The areas Home can open. Each joins as it's built (design-direction.md, rule 4). */
export type Area = 'sell' | 'sales' | 'products' | 'suppliers' | 'brands' | 'manufacturers' | 'categories' | 'stock' | 'users' | 'roles' | 'registers';

const Areas: { area: Area; title: string; description: string; right: AccessName; cannot: string }[] = [
  {
    area: 'sell',
    title: 'Sell',
    description: 'Ring up a sale: scan, discount, take cash, give change.',
    right: 'sales.sell',
    cannot: "Your role can't sell. Ask a manager.",
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
    description: 'Every product, with its code, barcode and price.',
    right: 'products.view',
    cannot: "Your role can't see products. Ask a manager.",
  },
  {
    area: 'suppliers',
    title: 'Suppliers',
    description: 'Who the shop buys from, and where they are.',
    right: 'products.view',
    cannot: "Your role can't see the product lists. Ask a manager.",
  },
  {
    area: 'brands',
    title: 'Brands',
    description: 'The brands products are sold under.',
    right: 'products.view',
    cannot: "Your role can't see the product lists. Ask a manager.",
  },
  {
    area: 'manufacturers',
    title: 'Manufacturers',
    description: 'Who makes the products.',
    right: 'products.view',
    cannot: "Your role can't see the product lists. Ask a manager.",
  },
  {
    area: 'categories',
    title: 'Categories',
    description: 'How products are grouped, one group inside another.',
    right: 'products.view',
    cannot: "Your role can't see the product lists. Ask a manager.",
  },
  {
    area: 'stock',
    title: 'Stock',
    description: 'How many of each product the shop has, deliveries in, and counts put right.',
    right: 'stock.view',
    cannot: "Your role can't see stock. Ask a manager.",
  },
  {
    area: 'users',
    title: 'Users',
    description: 'Who can sign in, and with which role.',
    right: 'users.view',
    cannot: "Your role can't see users. Ask a manager.",
  },
  {
    area: 'roles',
    title: 'Roles',
    description: 'What each kind of account may do.',
    right: 'roles.view',
    cannot: "Your role can't see roles. Ask a manager.",
  },
  {
    area: 'registers',
    title: 'Registers',
    description: 'The PCs people sign in at, and what each is called.',
    right: 'machines.view',
    cannot: "Your role can't see registers. Ask a manager.",
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
