# Phoenix — decisions

Newest at the bottom. A decision made in conversation counts only once it's written here.

## Settled

| Date | Decision | Why |
|---|---|---|
| 2026-10-16 | KVNsys moves to a **new generation built with web technology**. `Release/` stops and becomes a read-only reference. | Web technology has more potential, and more people can work on it |
| 2026-10-16 | **Finished means one branch, one full real day**, alongside the old register, with matching totals. Target: January 2027, not December. | Five generations were built and none ever traded. December is the Christmas rush. |
| 2026-10-16 | **Only the structure and the database schema** carry over from earlier generations. No code. | |
| 2026-10-16 | **TypeScript throughout:** NestJS, Prisma, PostgreSQL, React | From Kofi's architecture plan |
| 2026-10-16 | **A server PC at every branch** | Most branches have no reliable internet, and a branch must sell with no connection at all |
| 2026-10-17 | The family is **KVNsys**; this program is **KVNsys POS & Inventory**. "Phoenix" is only the folder name. | |
| 2026-10-17 | Delivered as an **installed desktop app**: double-click, its own window, nothing that looks like a website | |
| 2026-10-17 | **Electron** for the desktop app, not Tauri | See below |
| 2026-10-17 | **Reuse Release's project structure**, name for name | It's already a backend/frontend split, plus a shared middle (`KVNsysCore`, `KVNsysWire`) that two plain folders have nowhere to put. See the README. |
| 2026-10-17 | **Versions:** Node 24, pnpm 10, TypeScript 5.9 (not 7.0), NestJS 12, Prisma 7.10 (not the 8.0 release candidate), React 19, Vite 8, Electron 44, Vitest 5. Each pinned exactly. | TypeScript 7 is newer, but NestJS relies on decorator support TypeScript 7 has only just carried over. Prisma's "latest" tag points at a release candidate, not a release. |
| 2026-10-17 | **Until the first install, the baseline migration is edited in place** rather than adding a new migration for each change. After the first install, every change is a new migration. | Nothing has deployed, so there's no data a migration needs to protect. This is SCHEMA-PLAN's "one baseline". A local database built from an older baseline has to be recreated. |
| 2026-10-17 | The lineage columns (`created_by_user`, `created_at_machine`…) are **not foreign keys** | A product made at HQ arrives at a branch carrying an HQ user's id, and that user doesn't exist in the branch's database. A foreign key would refuse every delivery. |

## Why Electron

| | Electron | Tauri |
|---|---|---|
| Language | All TypeScript | Screens in TypeScript, the rest in Rust |
| Receipt printer, cash drawer | Built in: prints silently to a named printer | Needs Rust add-ons |
| Size | About 100 MB, more memory | About 10 MB, lighter |
| Track record | Very mature (VS Code, Discord, Slack) | Newer |

Nobody on the team writes Rust, and a POS lives or dies by its printer. The cost is weight: fine on
the 8 GB registers Kofi's plan recommends, tight on 4 GB.

## What the desktop app changed

Running in a browser had four known problems. A desktop app removes three of them:

| In a browser | In the desktop app |
|---|---|
| Can't print a receipt without a print dialog, or open the cash drawer | Prints silently, and sends the printer the drawer-open signal |
| Can't tell which PC it's on | Reads the PC's hardware id, which is what SCHEMA-PLAN's `machine_uuid` and `machine_name` columns were designed for |
| Security warnings on the shop's network | Trusts the branch server's own certificate, the way Release's `KVNsysWire` pinned it |
| The cashier screens have to be built | Still true. That's the work. |

**Replaced by this:**
- "Cashier screens are browsers on the shop's network" (2026-10-16). Registers run the desktop app.
- Device registration by browser cookie, built and then removed on 2026-10-17. A register is
  recognised by its hardware id. A manager still names it once.

**Cleaned up when `KVNsysPostgres` was set up (2026-10-17):** the schema's `device_token_hash`
column, its index, and the comments written for the browser design.

## Open

| Question | Who decides |
|---|---|
| A written ownership agreement between the partners | Both partners, before shared code exists |
| Can HQ set different prices per branch? | The owners |
| Which branch goes first, and on what date | The partners, with the branch manager |
| The refund flow | During the cashier interviews |
| HQ ↔ branch data as numbered packages, sent over the internet when it's up and on USB with the delivery when it isn't (proposed 2026-10-16) | The partners |

## How we work

- **Build one step at a time, and say everything a step includes before starting it.**
- **Nobody merges their own pull request.** The other partner reviews it.
- **Split work by business area** (for example selling vs catalog). Each area has its own folder
  inside every project, so two people rarely touch the same file.
- **A check that can't fail isn't a check.** Make every rule and test fail once on purpose. A
  structure check written for an earlier version of Phoenix passed while three of its five rules
  could never fire.
- **A test that can't run shows as skipped, never as passed.**
