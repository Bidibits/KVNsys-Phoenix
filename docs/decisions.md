# Phoenix — decisions

Newest at the bottom. A decision made in conversation counts only once it's written here.

## Settled

| Date | Decision | Why |
|---|---|---|
| 2026-10-16 | KVNsys becomes a **web application, in a new generation**. `Release/` stops and becomes a read-only reference. | Web has more potential and runs anywhere |
| 2026-10-16 | **Finished means one branch, one full real day**, alongside the old register, totals matching. Target: January 2027, not December. | Five generations were built and none ever traded. December is the Christmas rush. |
| 2026-10-16 | **Only the structure and the schema** are carried over. No code. | |
| 2026-10-16 | **Stack: NestJS + Prisma + PostgreSQL, React** (Vite, Tailwind, shadcn/ui) | From Kofi's architecture plan |
| 2026-10-16 | **A server PC at every branch**, browsers on the shop LAN | Most branches have no reliable internet |
| 2026-10-16 | Start without Redis, BullMQ, S3 storage or Docker | One fewer thing to install and keep alive on each branch PC. Add each one when something measurable needs it. |
| 2026-10-16 | Build POS + inventory only. CRM, HRIS, purchasing, accounting later or bought. | |
| 2026-10-17 | The generation is called **Phoenix** and lives in this repo beside the others | |
| 2026-10-17 | Build order: **seed → device registration → machine CRUD**, then the launch list | Every row records which machine wrote it, so machines come first. A machine belongs to a location, so the seed comes before them. |
| 2026-10-17 | **Device registration**, not hardware detection | Browsers can't read a hardware id or computer name. Built: design.md §8. |
| 2026-10-17 | **Lineage columns are not foreign keys** | An HQ user's id arrives at a branch where that user doesn't exist |
| 2026-10-17 | Versions: Node 24 LTS, pnpm 10, NestJS 12, Prisma 7.10, React 19, Vite 8, **TypeScript 5.9** | TypeScript 7 is newer, but NestJS depends on decorator support TS 7 has only just ported. Prisma's `latest` tag points at an 8.0 release candidate, so 7.10 is pinned. |
| 2026-10-17 | Sessions are signed cookies (12 h); passwords use scrypt | design.md §8 |

## Proposed, not yet agreed

| Proposal | Where |
|---|---|
| HQ ↔ branch data as numbered packages, over internet or USB | design.md §5 |

## Open

| Question | Who decides |
|---|---|
| A written ownership agreement between the partners | Both partners, before shared code exists |
| Can HQ set different prices per branch? | HQ / the owners |
| Which branch goes first, and on what date | The partners, with the branch manager |
| Refund flow | During the cashier interviews |

## How we work

- **Nobody merges their own pull request.** The other partner reviews it.
- **Split work by module, not by layer**, so two people aren't editing the same files.
- **A check that can't fail isn't a check.** When adding a rule or a test, make it fail once on
  purpose first. On day one the structure check passed while three of its five rules couldn't
  fire at all; planting a violation is what showed it.
- **A test that can't run shows as skipped, never passed.** The integration tests skip, by name,
  when there's no test database.
