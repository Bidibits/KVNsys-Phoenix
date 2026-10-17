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

## Proposed, not yet agreed

| Proposal | Where |
|---|---|
| HQ ↔ branch data as numbered packages, over internet or USB | design.md §5 |
| Build order: seed → device registration → machine CRUD | design.md §8 |
| Device registration instead of reading hardware ids | design.md §8 |

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
