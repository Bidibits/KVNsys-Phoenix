# Hand-over: picking Phoenix up on your own PC

Written 2026-10-24, when the selling work (October 20 to 24) went into `main`. Read this first, then
[`README.md`](../README.md), [`decisions.md`](decisions.md) and
[`design-direction.md`](design-direction.md). Those three are the record; this page only says where
things stand and how to carry on.

## Where it stands

`main` now has everything in the README's "Status", up to and including **Getting around**. Added
in this round:

- Inventory over the network, and the **Inventory** screen (called Stock until 2026-11-03): stock on hand, a product's history, receiving a
  delivery, putting a count right
- Sales in the database, selling over the network, and the **Sell** screen: scan, quantity, the
  senior/PWD discount, cash, change, the receipt on screen
- **Sales**: the day's receipts and totals, any day, any receipt again
- **Machines** (called Registers until 2026-11-02): each PC records itself at sign-in, and every
  save names it
- **Shifts**: cash in the drawer to start, counted against expected to end
- **Getting around**: Back and Forward, a search box on every list, "Saved …" notices, and asking
  before throwing work away

478 tests, across every project. The protocol is at 12.

Since then (2026-10-25): the whole of SCHEMA-PLAN is in the database (see
[`schema.md`](schema.md)), and suppliers, brands, manufacturers and categories have their lists
and forms, the product form has every field and a picture, and the products list shows each one's picture, category and brand, and the till charges promo and wholesale prices.

Since then (2026-10-27): the server has a dashboard (`KVNsysServerApp`, an Electron window run as
administrator) that turns it on and off, chooses whether it starts with the PC, lists who's connected
and disconnects them, and sets the server password machines must give. 637 tests; the protocol is
at 17.

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
at a database name you haven't used yet. Never put a real install's password in `.env` or anywhere it
could be copied from.

Then, in one window:

```
pnpm start:server
```

It creates the database, asks once for the location's name and the first administrator's username (Enter
for `admin`) and password, and prints the
address the machines use. In a second window:

```
pnpm start:app
```

Type the address it printed, and sign in with that username and password. To keep the app's test settings away from this
PC's real ones, run `set KVNSYS_APP_DATA=%USERPROFILE%\Desktop\Phoenix-test\app` in that window
first (Windows cmd).

**A walk through it:** Products, add one with a price. Inventory, Receive delivery, scan or type its code,
the pieces, Save delivery. Sell, Start shift with the cash in the drawer, scan the code, Pay. Sales
shows the receipt. Back on Sell, End shift and count the drawer. Machines shows this PC.

**Tests:** `pnpm test`, after `pnpm build`. The database tests need `KVNSYS_TEST_POSTGRES_URL` in
`.env`; without it they show as skipped, not passed.

## How a change is checked

Every check is in the code base, so whoever has the repo can run all of them. Each step of work has
been checked these four ways before it was committed:

1. **`pnpm test`** (after `pnpm build`): every test project. The window tests open the real app.
   Set `KVNSYS_SCREENSHOTS` to a folder first to keep a picture of each step they take, then look
   at them: pictures have caught things every test passed, such as a message below the fold.
2. **`pnpm check:plants`**: puts known mistakes into the code, one at a time, builds what they
   touch and runs the tests that should notice; each file is put back after. A mistake the tests
   miss means a test doesn't check what it claims to. The mistakes are listed per step in
   `scripts/checks/plants/` (a file, a piece of its text and what to put there instead); a step's
   new work comes with a new list. `pnpm check:plants <list>` runs one list, `--dry-run` only
   checks each mistake's text is still in its file. Run it with nothing else building: it takes
   about a minute a mistake, and the window tests open the app again and again.
3. **`pnpm check:package`** (after `pnpm package`): runs the programs in `out/` together, as the
   setup files will install them, on a throwaway database. The server sets a new location up the way
   its setup file does, then serves on a spare port; the built app connects, signs in with the
   username the setup chose, goes through Home, Machines and the Audit log, and drags a column
   narrower, which it finds again after signing in anew. It checks the
   server speaks the protocol the code says, so an `out/` older than the code is noticed, and runs
   `Uninstall all KVNsys.exe` in its check mode, which removes nothing, against what Windows says is
   installed. It never touches an installed KVNsys. What the uninstall tool removes is only proven by
   running it for real on a PC with KVNsys installed.
4. **Both repos match:** the replay and the tree check below.

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
- **A business day is Philippine time,** whatever the PC is set to. Use `businessDate` and `businessDay` in
  `KVNsysCore/selling/days.ts`.
- **Every save records who and at which machine.** On the server, `lineageOf(person, machine)` in
  `KVNsysServer/http/saving.ts`.
- **Every save to a table people edit writes the audit log,** in its own transaction:
  `recordCreated` / `recordChanged` in `KVNsysPostgres/audits/audit-log.ts`. A new save path that
  skips it leaves changes with no history.
- **The database is one baseline migration,** `src/KVNsysPostgres/prisma/migrations/20261017101440_baseline`,
  edited in place while no real location has data. After changing `schema.prisma`, regenerate the half
  Prisma writes, keep the hand-written half (the CHECKs and the triggers that refuse changes),
  check that Prisma finds no difference against the schema, and recreate every test database. Once
  a real location has data, this stops: every change becomes a new migration.
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
| Answers to the questions in `decisions.md`, "Open" | Above all: which goods the senior/PWD discount covers (ask the accountant), how the business counts stock, and whether a sale may take stock below zero (built as yes) |

**Still 🟢 in `design-direction.md`,** once the above arrives: printing, the import, and building
each list and form from one description.

**Set aside for now:** VAT (the discount stays 20% off the shelf price until it's taken up).

**To do, found while trying the installed setups (2026-10-28):**

| To do | What it takes |
|---|---|
| ~~**Rename Registers to Machines,** on screen and in the code~~ | **Done** (2026-11-02, protocol 20): the screen, its tile, the messages ("this machine"), and in the code the files, types and calls (`/api/machines`, `MachineBook`, `ListedMachine` and the rest). New machines get codes like `HQ-M01`. "Register" as a verb stays (the `machines.register` right, `pg_ctl register`, `Register-ScheduledTask`), and so does "the old register", the location's old POS. |
| ~~**The Machines list shows every column**~~ | **Done** (2026-10-30), and every other list too: each shows every column, then who made the record and who last updated it, when, on which machine and at which location, in a grid like Beta's (`decisions.md`). |
| ~~**An audits screen,** to see each change by table, record and column~~ | **Done.** Every save writes its changes (2026-10-28) and the Audit log screen shows them (2026-10-29): `schema.md`, "What the audit log records". |
| ~~**The first account's username**~~ | **Done** (2026-10-30): the setup's page asks for it, starting as `admin`. `decisions.md`, Settled. |

**To do, agreed with the user on 2026-11-02 after they looked through the app,** one step at a time.
None of it needs a change to the database's tables.

| To do | What it takes |
|---|---|
| ~~**Lines between columns, dragged to resize**~~ | **Done** (2026-11-02, protocol 21): double-click fits; each person's widths kept on the server (`decisions.md`, Settled). |
| ~~**"Shop" becomes "Location"**, on screen and in the code; "Address" for where it is~~ | **Done** (2026-11-03, protocol 22): the screens, the setup, the messages and the code. Where "shop" meant the whole business it says "the business", the network is "the local network", and the clock and its days are the business's (`businessDate`, `businessDay`). "Address" waits for the Locations screen, below. |
| **The place tables in use** | PSA's list of regions, provinces, cities and municipalities and barangays checked and loaded at setup (SCHEMA-PLAN, "Still open" 1), and a Locations screen that picks each, narrowing the next, then the street. Each branch's own code is set there; today every install is `HQ`. |
| ~~**What the setup makes is credited to the admin it makes**~~ | **Done** (2026-11-03): the location, the server PC, the Administrator role and the admin account, and their lines in the audit log, are by that admin; anything made while nobody was signed in shows a dash, and the Audit log's Who calls it "No one". |
| ~~**"Stock" becomes "Inventory"**~~ | **Done** (2026-11-03, protocol 23): the tile and screen, Receive delivery and Adjust count, the rights (`inventory.view`, `inventory.receive`, `inventory.adjust`), `/api/inventory`, and in the code the ledger (`InventoryLedger`) and the calls. "Stock" stays where it means a product's count: the `stock` column, "In stock", `tracksStock`. |
| **Home: seven tiles** | Transact, Sales, Products, Inventory, Users, Machines, Audit log. Suppliers, Brands, Manufacturers and Categories are buttons inside Products (as Beta's Products dashboard had them); Roles is inside Users. |
| **Inventory Logs** | The History button on each row goes; an Inventory Logs button at the top of Inventory shows every product's movements, as a grid. |
| **"Sell" becomes "Transact"** | The selling screen's name. Its records stay `receipts`. |
| **Sales as a full grid** | Every column of `receipts` in its order, then its three events, opened, settled and voided, in place of created and updated (settled is who rang it up and took the money, where and when). |

## Continuing with Claude Code

Open Claude Code in the Phoenix folder and start with:

> Read docs/handover.md, then README.md, docs/decisions.md and docs/design-direction.md. Then tell
> me what you'd build next, and everything that step includes, before starting it.
