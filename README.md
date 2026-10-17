# Phoenix

The sixth generation of KVNsys, and the first one built for the web. Begun 2026-10-17 by the
two partners on the project.

Same problem as every generation: head office encodes a product once, and it appears correctly
at the branch that receives it, with nobody retyping it.

**What's different this time is the finish line.** Five generations were built and none ever
traded a real day at a real shop. Phoenix is finished when **one branch rings real customers
through it for one full day, alongside the old register, and the day's totals match.** Every
plan in `docs/` is ordered around reaching that day, with January 2027 as the target.

## Stack

| Layer | Choice |
|---|---|
| Backend | **NestJS** (Node.js, TypeScript): one app split into modules |
| Database | **PostgreSQL 16** through **Prisma** |
| Frontend | **React** + Vite + Tailwind + shadcn/ui |
| Tests | Vitest; Playwright for end-to-end |

## Where it runs

A **server PC at every branch**, running the API and the database. Cashier screens are browsers
on the shop's own network. Most branches have no reliable internet, so a branch must be able to
sell with no connection at all, indefinitely.

## What's carried over from earlier generations

Only two things, and no code:

1. **The structure.** Rules in the middle, the database at one edge, screens at the other, and
   dependencies pointing inward only. See [`docs/design.md`](docs/design.md).
2. **The schema.** The 30-table design in [`../Release/SCHEMA-PLAN.md`](../Release/SCHEMA-PLAN.md),
   with the changes listed in `docs/design.md`.

## Documents

| File | What |
|---|---|
| [`docs/design.md`](docs/design.md) | How the system is shaped, and why |
| [`docs/decisions.md`](docs/decisions.md) | Each decision, when it was made, and what's still open |

## Status

**Nothing built yet.** The next step is the walking skeleton (see `docs/design.md` §8).
