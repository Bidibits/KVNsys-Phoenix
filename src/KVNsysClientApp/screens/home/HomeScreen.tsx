import type { AccessName, SignedInUser } from '@kvnsys/client';
import { Tile } from '@kvnsys/ui';

/** The areas Home can open. Each joins as it's built (design-direction.md, rule 4). */
export type Area = 'products' | 'users' | 'roles';

const Areas: { area: Area; title: string; description: string; right: AccessName; cannot: string }[] = [
  {
    area: 'products',
    title: 'Products',
    description: 'Every product, with its code, barcode and price.',
    right: 'products.view',
    cannot: "Your role can't see products. Ask a manager.",
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
