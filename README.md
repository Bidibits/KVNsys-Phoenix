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

**The skeleton runs.** A fresh database can be seeded, and a browser can be registered as a
register by a manager. Next: machine CRUD, then the launch list (`docs/design.md` §8). Nothing has
been installed on a branch PC yet.

## Layout

```
apps/api          NestJS server: wires the modules together; also `pnpm seed`
apps/pos-web      the cashier screen (React)
modules/          the system, one folder per area: identity, locations, setup
                  each with domain/ · application/ · infrastructure/ · http/
packages/         contracts (shared request/reply shapes) · api-client
database/         Prisma schema, migrations, generated client
```

`pnpm check:structure` enforces the layer rules (`docs/design.md` §6) and fails the build when one
is broken.

## Running it on your machine

Needs **Node 24**, **pnpm 10** and **PostgreSQL 16**.

```bash
pnpm install
```

Copy `.env.example` to `.env` and fill it in: a database URL, a long random session secret, and an
admin password for the first run. Then create the database, build, and seed it:

```bash
pnpm build
```

```bash
pnpm db:deploy
```

```bash
pnpm seed
```

Start the API and the cashier screen, each in its own terminal:

```bash
pnpm dev:api
```

```bash
pnpm dev:pos
```

Open `http://localhost:5173`. A new browser shows **This device isn't registered**. Sign in as
`admin`, give the register a code and a name, and from then on that browser is that register.
Another device on the same Wi-Fi can open `http://<this PC's IP>:5173`, as long as Windows Firewall
allows Node through.

## Tests

```bash
pnpm test
```

Unit tests always run. The integration tests drive the real API against a database, so they run
only when `PHOENIX_TEST_DATABASE_URL` is set. They wipe it, and refuse any database whose name
doesn't end in `_test`. Without it they show as **skipped**, never as passed. CI runs everything
on each push (`.github/workflows/phoenix.yml`).
