# Hand-over: picking Phoenix up on your own PC

Written 2026-10-24, when the selling work (October 20 to 24) went into `main`. Read this first, then
[`README.md`](../README.md), [`decisions.md`](decisions.md) and
[`design-direction.md`](design-direction.md). Those three are the record; this page only says where
things stand and how to carry on.

## Where it stands

`main` now has everything in the README's "Status", up to and including **Getting around**. Added
in this round:

- Stock over the network, and the **Stock** screen: stock on hand, a product's history, receiving a
  delivery, putting a count right
- Sales in the database, selling over the network, and the **Sell** screen: scan, quantity, the
  senior/PWD discount, cash, change, the receipt on screen
- **Sales**: the day's receipts and totals, any day, any receipt again
- **Registers**: each PC records itself at sign-in, and every save names it
- **Shifts**: cash in the drawer to start, counted against expected to end
- **Getting around**: Back and Forward, a search box on every list, "Saved …" notices, and asking
  before throwing work away

478 tests, across every project. The protocol is at 12.

Since then (2026-10-25): the whole of SCHEMA-PLAN is in the database (see
[`schema.md`](schema.md)), and suppliers, brands, manufacturers and categories have their lists
and forms. 514 tests; the protocol is at 13.

## Getting it onto your PC

Needs Node 24, pnpm 10 (`npm install -g pnpm@10.34.7`) and PostgreSQL. In the Phoenix folder:

```
git switch main
git pull
pnpm install
pnpm build
```

**Use a new database.** The tables changed, and they live in one baseline migration that's edited in
place (see below), so a database made before 2026-10-25 won't match. In `.env`, point `DATABASE_URL`
at a database name you haven't used yet. Never put a real shop's password in `.env` or anywhere it
could be copied from.

Then, in one window:

```
pnpm start:server
```

It creates the database, asks once for the shop's name and a password for `admin`, and prints the
address registers use. In a second window:

```
pnpm start:app
```

Type the address it printed, and sign in as `admin`. To keep the app's test settings away from this
PC's real ones, run `set KVNSYS_APP_DATA=%USERPROFILE%\Desktop\Phoenix-test\app` in that window
first (Windows cmd).

**A walk through it:** Products, add one with a price. Stock, Receive stock, scan or type its code,
the pieces, Save delivery. Sell, Start shift with the cash in the drawer, scan the code, Pay. Sales
shows the receipt. Back on Sell, End shift and count the drawer. Registers shows this PC.

**Tests:** `pnpm test`, after `pnpm build`. The database tests need `KVNSYS_TEST_POSTGRES_URL` in
`.env`; without it they show as skipped, not passed.

## Two repos, kept the same

Phoenix is in two places on GitHub, and both hold the same thing:

| Repo | Who can see it | Phoenix is |
|---|---|---|
| `Bidibits/KVNsys-Project` | Private | the `Phoenix/` folder, beside Capstone, Alpha, Beta and Release |
| `Bidibits/KVNsys-Phoenix` | Public | the whole repo |

Every change goes into both, as the same commits with the same messages. Work in either one, then
carry the new commits to the other by replaying them, never by force-pushing:

- **Private to public:** in the private repo,
  `git format-patch --binary --relative=Phoenix -o <folder> <last-synced>..HEAD -- Phoenix`; in a
  clone of the public repo, `git am <folder>/*.patch`, then push.
- **Public to private:** in a clone of the public repo,
  `git format-patch --binary -o <folder> <last-synced>..<tip>`; in the private repo,
  `git am -3 --directory=Phoenix <folder>/*.patch`, then push.

Then check they match: `git rev-parse HEAD:Phoenix` in the private repo has to equal
`git rev-parse HEAD^{tree}` in the public one. A full clone of the private repo fails on Windows
(some old Alpha paths are too long); clone it with `--no-checkout` when only its history is needed.

## Before changing anything

Most of this is in the README and `decisions.md`; these are the ones that are easy to miss.

- **One step at a time,** and say everything a step includes before starting it.
- **Dependencies point inward.** The guard runs first in `pnpm build` and names any import that
  breaks the table in the README.
- **Money is whole centavos** in code, and pesos as text on the wire (`"1500.50"`). Never a
  fraction of a centavo, never a floating-point peso.
- **A shop day is Philippine time,** whatever the PC is set to. Use `shopDate` and `shopDay` in
  `KVNsysCore/selling/days.ts`.
- **Every save records who and at which register.** On the server, `lineageOf(person, register)` in
  `KVNsysServer/http/saving.ts`.
- **The database is one baseline migration,** `src/KVNsysPostgres/prisma/migrations/20261017101440_baseline`,
  edited in place while no real shop has data. After changing `schema.prisma`, regenerate the half
  Prisma writes, keep the hand-written half (the CHECKs and the triggers that refuse changes),
  check that Prisma finds no difference against the schema, and recreate every test database. Once
  a real shop has data, this stops: every change becomes a new migration.
- **A call's shape changes, the protocol goes up:** `ProtocolVersion` in `KVNsysWire/hello.ts`.
- **A new right** goes in `Accesses`, `AccessDescriptions` and `RightGroups`, in
  `KVNsysCore/identity/accesses.ts`. The Administrator holds it without being told.
- **A new call from the screens** goes in `desktop/bridge.ts`, `preload.cts` and `main.ts`, and in
  the list of bridge names in `tests/KVNsysClientApp.Tests/first-window.test.ts`.
- **Make every new test fail once on purpose,** then put it right. A test that can't fail isn't one.
- **Screenshot every screen you change.** Several layout faults here passed every test and only
  showed in a screenshot ("Learned the hard way" in `decisions.md`).

## What's next

**Waiting on the user, not on code:**

| Needed | For |
|---|---|
| 10–20 rows of the current system's product export | The import converter. It has to exist before December's practice runs. |
| The receipt printer's make and model | Printing the receipt, the last 🟢 on the selling screen |
| One restore tested on the real server PC (`check-backup.ps1`) | "A nightly backup, and one restore actually tested" |
| Answers to the questions in `decisions.md`, "Open" | Above all: which goods the senior/PWD discount covers (ask the accountant), how the shop counts stock, and whether a sale may take stock below zero (built as yes) |

**Still 🟢 in `design-direction.md`,** once the above arrives: printing, the import, and building
each list and form from one description.

**Set aside for now:** VAT (the discount stays 20% off the shelf price until it's taken up).

## Continuing with Claude Code

Open Claude Code in the Phoenix folder and start with:

> Read docs/handover.md, then README.md, docs/decisions.md and docs/design-direction.md. Then tell
> me what you'd build next, and everything that step includes, before starting it.
