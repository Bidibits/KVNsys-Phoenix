# Remaining work

Written 2026-11-03 for whoever picks Phoenix up next. After looking through the app on 2026-11-02,
the user agreed a list of changes. Most of it is built (handover.md, "What's next"); this page is
what's left, so another session can take it on. **When all of it is done, delete this file and its
line in [`handover.md`](handover.md)**, in the commit that finishes the last piece.

Read [`handover.md`](handover.md) first: setting Phoenix up on a PC, how a change is checked, and the
two repos that must stay the same. Then [`README.md`](../README.md), [`decisions.md`](decisions.md)
and [`design-direction.md`](design-direction.md).

## How to work

- **One piece at a time, and only once the user says go.** Before starting a piece, say everything
  it includes. Each piece below ends with what to ask first.
- **Use the business's words.** HQ or a branch is a *location*; the whole business is *the
  business*; a PC is a *machine*; the selling screen is *Transact*; stock is the *inventory*. Say
  "schema change" for a change to Phoenix's own tables: the user hears "migration" as bringing in
  data from the old system.
- **Check each piece before committing it** (handover.md, "How a change is checked"): `pnpm build`
  and `pnpm test` with nothing skipped; a new list of planted mistakes in `scripts/checks/plants/`,
  run with `pnpm check:plants <list>`; `pnpm check:plants --dry-run` over every list, because a
  piece that changes text an older list quotes leaves that list dead and only a dry run shows it;
  `pnpm package` then `pnpm check:package`; and a screenshot of every screen it changes, looked at.
  Screenshots have caught faults every test passed.
- **Then record it:** a row in `decisions.md`, the README's Status, the row in handover.md's "What's
  next", and the same commits in both repos.

## 1. Sales as a full grid

**Asked for:** the Sales list has none of the "created" columns every other list has had since the
grids (2026-10-30).

**Why not yet:** the Sales screen is still the old simple table
(`src/KVNsysClientApp/screens/selling/SalesScreen.tsx`: receipt, time, cashier, pieces, discount,
total, View). And `receipts` has no `created_*` columns on purpose: SCHEMA-PLAN put three events in
their place, each with who, on which machine, at which location and when:

- **settled**: who rang the sale up and took the money. This is the receipt's "created".
- **opened**: when the sale began. Nothing fills it yet.
- **voided**: for when voiding exists. Nothing fills it yet.

**What it takes:**

- **The screen:** a wide `RecordTable` like the other grids (`machines/MachinesScreen.tsx` and
  `inventory/InventoryLogsScreen.tsx` show how): `idColumn()` first, then every column of `receipts`
  in the table's order (code, shift, location, number, subtotal, discount total, total, discount
  kind, ID number, name on the ID, status, void reason, description), then **Pieces**, which no
  column holds but the list shows today (after the table's own columns, the way Roles shows Rights
  and Accounts), then the three events in place of the Updated and Created columns: Opened by /
  machine / location / at, then Settled, then Voided. Names in place of ids, as everywhere else: the
  shift's code, the location's and the machine's names, a person as "Name (username)", a dash for
  nobody. View stays, pinned right like Edit on the other grids. The Day picker, Today and the four
  figures above the list stay.
- **The call:** `GET /api/sales` sends each receipt's summary (`ReceiptSummaryOnWire` in
  `src/KVNsysWire/selling.ts`). It grows the missing columns and the three events with their names;
  the client's `ReceiptLine` (`src/KVNsysClient/selling/sales.ts`) follows; the server fills them in
  `day()` in `src/KVNsysServer/http/sales.controller.ts`, asking for the names a few questions per
  list, the way `historiesOf` in `src/KVNsysPostgres/audits/record-history.ts` does. The protocol goes
  up, with its line in `src/KVNsysWire/hello.ts`.
- **Tests:** `tests/KVNsysClientApp.Tests/sales.test.ts` reads the new grid; `expectTableOrder` and
  `expectCompact` from `table-cells.ts` there check the headings follow the table and the rows are
  compact; the server's tests check the names, including a cashier whose account isn't on this
  server.

**Ask the user first:**

- **"Sales" or "Receipts"?** The open row in `decisions.md`. Recommended: the screen and its tile
  become **Receipts**, and the table keeps its name. Renaming the table would change every part of
  selling for nothing gained, and at HQ "sales" already names the branches' summaries. Settle it
  before building, so the screen isn't renamed twice.
- **Fill "opened"?** The machine could send the time the first item was scanned, with the sale. That
  changes the sale call too, so it's the user's call whether it belongs in this piece.

## 2. Advance Search on every list

**Asked for:** Advance Search, as Beta had it. Today every list has one search box in the top bar,
which matches text anywhere in a row.

**What Beta did** (design-direction.md, rules 2 and 5): an Advance Search button beside the search
box opened a panel with a box per field. Release's version was built from each table's description:
a text box for text (contains), a from–to pair for numbers, money and dates, and a list of the values
present for a choice (a status, a category), all combined with AND.

**What it takes:**

- **Where it lives:** a button beside the search box in the top bar (`src/KVNsysUI/AppFrame.tsx`),
  opening a `FormPanel` from the right with one field per column of the list on screen.
- **Built from one description:** each list already describes its columns (`Column<T>` in
  `src/KVNsysUI/RecordTable.tsx`). Advance Search needs, for each column, the kind of value (text,
  number, money, date, choice) and the value itself rather than the cell as drawn. Adding that to
  `Column` once gives every list its search, which is the 🟢 "built from one description" in
  design-direction.md.
- **Lists that hold every row** (products, the catalogue's four lists, users, roles, machines, the
  inventory, a day's sales) can search the rows already loaded. **Lists that hold only the newest
  500** (the audit log and the inventory log) have to ask the server, or the search misses older
  rows. The audit log's call already takes a table, a record, a person and a from–to day
  (`src/KVNsysWire/audits.ts`); the inventory log's call takes nothing yet.

**Ask the user first:** where the button goes (the top bar as in Beta, or each list's row of
buttons), and whether a list remembers its last search for each person (`user_settings`, as column
widths are kept).

## 3. The Locations screen and the place list

**Asked for:** use the place tables the user designed in SCHEMA-PLAN, and say **Address** for where
a location is.

**Where it stands:** `countries`, `regions`, `provinces`, `municipalities` and `barangays` are in
the database, keyed by the official PSGC codes, and empty. A location can point at each one and has
an `address` for the street, but no screen sets any of it. Every install makes one location, coded
`HQ`.

**What it takes:**

- **PSA's list, checked first** (SCHEMA-PLAN's "Still open" 1). PSA publishes the PSGC on its
  website. **Ask the user before downloading it.** It has about 42,000 barangays. Before loading,
  check it against the tables: how it lays out NCR and the cities that belong to no province
  (`municipalities.province_code` can't be empty), which form of the code it uses, and how it tells
  a city from a municipality (`municipalities.type`).
- **Loading it:** the list is the same at every install, so it ships with the server and loads at
  setup, in the setup's transaction. The place tables carry no lineage on purpose (`schema.prisma`),
  so loading them is not an edit anyone makes. Decide with the user what a newer list does to a
  location that points at a place PSA has since merged or split.
- **The screen:** Locations, a grid and a form panel like the other lists: code, name, then Region,
  Province, City or municipality and Barangay, each picked from a list that narrows the next, then
  **Address** (street and building), status and description. It needs new rights,
  `locations.view` and `locations.manage`, in `src/KVNsysCore/identity/accesses.ts` (the
  Administrator holds them without being told). Saves write the audit log, like every table people
  edit.
- **Each branch's code** is set here. Receipts, shifts and machines carry it (HQ-000042, HQ-S00001,
  HQ-M01), so a code shouldn't change once it's on a receipt. The server also finds its own location
  through `serverMachineCode(FirstLocationCode)`, its own machine `HQ-SRV`, in several controllers
  (search for `FirstLocationCode`): a branch with its own code needs that to come from the server's
  own record instead.

**Ask the user first:** where Locations opens from (Home has the seven tiles they chose), whether the
setup should ask for the location's code (today it asks only the name and makes `HQ`), and whether
a code may change after its first receipt (recommended: no).

## Small things noticed, not fixed

- The top bar keeps a machine's name from sign-in: rename the machine you're on and the bar shows
  the old name until the next sign-in.
- `pnpm check:plants` only builds the pnpm packages and runs `pnpm test`'s tests, so it can't plant
  a mistake in `Uninstall all KVNsys.exe` (Inno Setup) or in what `pnpm check:package` checks.
- The inventory log shows the newest 500 lines; older ones, and searching it by product, kind and
  day, wait for piece 2.
