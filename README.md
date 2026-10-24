# Phoenix

The sixth generation of KVNsys. It builds **KVNsys POS & Inventory**, the point of sale and
stock system for the seven-branch business, and the first KVNsys program made with web
technology.

To the people using it, it's an ordinary program: install it, double-click the icon, and it opens
in its own window. Nothing about it looks like a website.

"Phoenix" is only this generation's folder name, as `Release` was before it. Every program inside,
and everything a user sees, is called KVNsys.

## Status

**So far:**
- **The seed:** the one-time setup that makes a new install usable. It creates the first shop,
  this PC as its first machine, one role (Administrator, with every right) and the first admin.
  Every other role is made by hand.
- **KVNsys Server starts and answers on the shop's network.** Other PCs can ask it what it is,
  which version it is, and which protocol it speaks. On a shop's server PC it installs from one
  setup file and starts with Windows, with a nightly backup (see "For the server PC" below).
- **The client engine can connect to a server.** Given an address the way a person types it
  (`192.168.0.111`), it checks the server is a KVNsys Server speaking the same protocol. If not,
  it says why in plain words: a bad address, nothing there, not a KVNsys Server, or a different
  update and which side to update.
- **The first window.** KVNsys POS & Inventory opens as its own program window, with no browser
  look. It asks for the server address and shows whether it connected. Once it has connected,
  it remembers the address on this PC and connects on its own the next time it opens. There's
  no sign-in yet.
- **Signing in.** Once connected, the app asks for a username and password, checks them with the
  server, and shows who signed in, or why not ("Wrong username or password." whether the password
  is wrong or the name doesn't exist, so nobody can use it to find usernames). The password only
  ever goes to a server this register already trusts.
- **Sessions.** A sign-in comes with a pass that proves who's signed in, for the requests that
  follow. It lasts 12 hours and lives only in the app's memory, on the desktop side: the screens
  never see it and it's never written to disk. Signing out hands it back and the server cancels
  it. Restarting the server ends every session, and registers sign in again.
- **The server sets up a new install by itself.** Given an empty database, or one that doesn't exist yet, it creates what's missing and
  asks once for the shop's name and the first administrator's password. No pnpm needed.
- **Every connection is HTTPS, and the app knows its server.** The server makes its own security
  certificate the first time it starts, and keeps it. The app trusts the first certificate it meets
  at an address, and from then on refuses any other there. So a different machine answering at the
  server's address, an impostor, is turned away before anything is sent.
- **Products, in the database.** The start of the product catalog: a product has a code (what
  staff type), a barcode (what the scanner reads, if it has one), a name, a price and a status.
  Prices are exact to the centavo. A code or barcode belongs to one product only, so a scan can
  never find two.
- **Products over the network.** A signed-in register can list, find, add and change products
  through the server, if the person's role allows it: a cashier can look products up, a manager
  can also add and change them. Rights are checked on every request, so taking one away, or
  switching an account off, works at once.
- **The window frame, Home, and the products list.** Once signed in, the app shows a dark grey
  title bar (Home, the screen's name, who's signed in, Sign out) over Home: one tile per area,
  greyed out, with the reason, where the role lacks the right. The Products tile opens every
  product in a table, with prices in pesos and statuses as coloured labels. The screens follow
  Beta's Standard colours ([`docs/design-direction.md`](docs/design-direction.md)).
- **Adding and changing products.** Someone whose role may manage products gets Add product
  above the list and Edit on every row. Each opens a panel from the right with the code,
  barcode, name, price and status. Save checks it and sends it to the server, and the list
  shows the result; a refusal says what to fix and keeps what was typed. Editing starts from
  the product as the server has it now. A barcode scanner's Enter in the Barcode box moves on
  to Name instead of saving.
- **Users.** The Users tile lists every account: name, username, role and status. Someone whose
  role may manage users gets Add user and Edit, in the same panel: names, username, role, Active
  or switched off, and a first password typed twice. A password is never shown; Edit has its own
  "Set new password", which signs that person out wherever they are. Switching an account off
  signs it out at once too. Usernames ignore capitals ("Ana" is ana). No change may leave nobody
  able to manage users, so nobody can lock the shop out, themselves included.
- **Roles.** The Roles tile lists every role with its rights in a few words and how many accounts
  have it. Someone whose role may change roles gets Add role and Edit: a name, Active or switched
  off, and a tick box per right, grouped by area (Registers, Products, Users, Roles). Ticking
  "change" ticks "see" with it. A change counts at once; switching a role off signs out everyone
  who has it. The Administrator always holds every right, including any a later version adds, and
  stays switched on: only its name can change.
- **Stock movements, in the database.** Every change to a shop's stock of a product is one line:
  how many pieces in or out, why (in from a supplier, out to a customer, or a count put right,
  which needs a reason), which document caused it, who, when, and the stock just after it. Stock
  on hand is those lines added up, and a running total is kept beside them in the same save, so
  reading stock is quick and the two never disagree. A line is never changed or deleted, and the
  database itself refuses to; a mistake is put right by another line. Many sales at once never
  lose a piece.
- **Stock over the network.** A signed-in register can see the shop's stock (every product, with
  how many are here), one product's stock with its newest movements and who made each, and can
  record goods in from a supplier or put a count right with the reason, one line or a whole
  delivery at once, all saved or none. Each needs its own right: see stock, receive stock, adjust
  stock. Goods out to a customer can't be typed in; only a sale will record them. The stock is
  always the server's own shop's, since each branch has its own server.
- **The Stock screen.** A Stock tile on Home opens every product with how many the shop has (below
  zero shows in red). History on a row shows that product's movements, newest first: when, what,
  how many, the stock after, who, and the note. Receive stock takes in a whole delivery: scan or
  type each code or barcode, then its pieces, add the line, and save it all at once with one note,
  such as the supplier's DR number; a scanner's Enter never saves it half-done. Adjust on a row
  puts a count right: the pieces counted on the shelf and why they're different. Each button only
  shows for someone whose role has the right.
- **Sales, in the database.** A sale is priced in one place, KVNsysCore, so the till and the server
  can't disagree: each line is its price times its pieces, and the senior/PWD discount takes 20%
  off every line, keeping the ID number and the name. A product switched off, or with no price
  yet, can't be sold. Recording a sale saves its receipt, its lines and its cash payment, and takes
  its pieces out of stock, all in one go or not at all. Receipts are numbered per shop, HQ-000001
  and up, with no gaps, even when registers sell at once. Each line keeps the code, name and price
  as sold. The database refuses to change or delete a receipt.
- **Selling over the network.** A role with the new "Sell" right can find a product by what was
  scanned or typed, and record a sale paid in cash. The register keeps the cart and prices it with
  the same rules as the server; the server prices it again from its catalog as it is now, and
  refuses the sale if a price changed since it was rung up, so nobody is charged what the cashier
  didn't see. The sale is always at the server's own shop, and the receipt comes back with the
  shop's name and the cashier's.
- **The selling screen.** A Sell tile on Home opens it, with the cursor already in the code box: a
  scan, or a code and Enter, adds one; scanning it again adds another. Each line has − and + and
  a × to remove it. The senior/PWD discount takes the ID number and the name on the ID. Pay takes
  the cash given, says if it's short, and records the sale; the receipt then shows on screen (the
  shop, its number, when, the cashier, every line, the discount and whose ID, total, cash and
  change) with the change in big type, and Enter starts the next sale. The cart is kept by the
  register's desktop side, priced with KVNsysCore's rules at every change, so a product that can't
  be sold never gets in. Signing out empties it. No printing yet.
- **The day's sales.** A Sales tile, for a role with the new "See sales" right, opens today's
  sales at the shop: how many receipts, what they came to before and after discounts, and every
  receipt (number, time, cashier, pieces, discount, total), oldest first. Another day can be
  picked. View opens any receipt again, as it was given. A day is midnight to midnight Philippine
  time, and times show in Philippine time, whatever time zone a PC is set to.
- **Registers.** A PC records itself as a register of the shop the first time someone signs in at
  it (by its Windows machine id, so renaming the PC doesn't matter), as "New register (its
  computer name)". The title bar then shows the register's name beside who's signed in, every
  save (products, stock, sales, users, roles) records which register it was made at, and a
  receipt names its register. A Registers tile lists them, the server PC first; a manager names
  them, or switches one off, which signs out whoever is at it and stops anyone signing in there.
- **Shifts.** Before the first sale, a cashier starts a shift with the cash counted into the drawer;
  every sale then goes into it, and none can be rung without one. End shift (with no sale in
  progress) shows the cash at the start and the shift's cash sales, and takes the cash counted out
  and a note. KVNsys works out what the drawer should hold, and the report says how far out it is:
  "₱20.00 short", "₱5.00 over" or "Exact". Shifts are numbered per shop with no gaps (HQ-S00001),
  each cashier has one open at a time, and a closed shift never changes.

Everything else is still to come. How the screens will look and work, and which features come
before January, is in [`docs/design-direction.md`](docs/design-direction.md). Read it before
building a screen.

**For IT:**
- The server's certificate is in `C:\ProgramData\KVNsys\Server` (or `KVNSYS_SERVER_DATA`) on the
  server PC. Back it up: if it's lost, every register has to be reset.
- To reset a register's trust, for example after replacing the server PC, delete
  `trusted-servers.json` in `%APPDATA%\KVNsys POS & Inventory` on that register. It will then
  trust the next server it connects to.
- The server prints its certificate fingerprint when it starts, so the first connection can be
  checked against it. The schema (twelve tables, in one baseline migration) is in
  `src/KVNsysPostgres/prisma/`.

## How it runs

| Where | What runs | Who starts it |
|---|---|---|
| The server PC at each branch, and at HQ | **KVNsys Server** and PostgreSQL | It starts with Windows, in the background. Nobody double-clicks it. |
| Each register | **KVNsys POS & Inventory**, the desktop app | The cashier double-clicks it. It finds the branch server over the shop's own network. |

A branch never needs the internet to sell.

## The structure

The same shape as `Release/`, nearly name for name:

```
Phoenix/
├─ src/
│  ├─ KVNsysCore/        the rules both sides share: prices, discounts, what's allowed
│  ├─ KVNsysWire/        the calls between client and server, and the shape of each
│  ├─ KVNsysPostgres/    the only place with SQL: schema, migrations, saving and loading
│  ├─ KVNsysServer/      the server engine: answers the calls, checks permissions
│  ├─ KVNsysServerApp/   later: a window for managing the server
│  ├─ KVNsysClient/      the client engine: connection, sign-in, the cart. No screens.
│  ├─ KVNsysUI/          shared screen pieces: big buttons, keypad, tables
│  └─ KVNsysClientApp/   the desktop app cashiers double-click
└─ tests/                one folder per project, as in Release
```

Inside each project, every business area gets its own folder: `identity`, `locations`,
`catalog`, `inventory`, `selling`. There's also `shared` for basics every area uses, and `setup`
for the first-install seed. Release's `KVNsysCore` was organised the same way. So selling
lives in `KVNsysCore/selling`, `KVNsysServer/selling`, `KVNsysClientApp/selling`, and so on.

## Who may use whom

Dependencies point inward, as in Release:

| Project | Group | Is | May use |
|---|---|---|---|
| `KVNsysCore` | Shared | The rules and records | Nothing |
| `KVNsysWire` | Shared | The calls and their shapes | Core |
| `KVNsysPostgres` | Backend | The only project containing SQL | Core |
| `KVNsysServer` | Backend | The server engine. No screens | Core, Wire, Postgres |
| `KVNsysServerApp` | Backend | The server's window (later) | Server |
| `KVNsysClient` | Frontend | The client engine. No screens | Core, Wire |
| `KVNsysUI` | Frontend | Shared screen pieces | Core |
| `KVNsysClientApp` | Frontend | The desktop app | Client, UI |

- **`KVNsysCore` uses nothing else:** no framework, no database, no screens.
- **Only `KVNsysPostgres` contains SQL.**
- **Nothing in the frontend uses `KVNsysPostgres` or `KVNsysServer`.** A register reaches the
  database only by asking the server.
- **Engines hold no screens; screens hold no rules.**

**The guard enforces all of this.** `pnpm build` runs it first. It reads every import in `src/`,
and if a rule is broken it stops the build and names the file and the rule. The table is enforced
exactly as written: `KVNsysClientApp` may use `KVNsysClient` and `KVNsysUI`, not `KVNsysCore`
directly. When a project genuinely needs something new, change this table and the guard
(`.dependency-cruiser.cjs`) together, on purpose. Test projects aren't checked.

Proven on 2026-10-17. A mistake was planted for each of the guard's 12 rules, and every one was
caught. Allowed imports were not flagged, and a broken rule stopped the build before anything
compiled.

| In Release it was | Here |
|---|---|
| `KVNsysCore`, `KVNsysWire`, `KVNsysPostgres`, `KVNsysServer`, `KVNsysClient` | The same names |
| `KVNsysConsoleUI` / `KVNsysWinformUI` (Beta called it `KVNsysUI`) | `KVNsysUI` |
| `KVNsysServerConsole` / `KVNsysServerWinform` | `KVNsysServerApp` |
| `KVNsysClientConsole` / `KVNsysClientWinform` | `KVNsysClientApp` |

## Why not just a `backend/` and a `frontend/` folder?

Because some things belong to both. The senior/PWD discount is one: the cashier's screen needs it
to show the total, and the server needs it to save the sale. It's written once, in `KVNsysCore`,
and runs on both sides. With only two folders it would be written twice, or exist on one side only.

The backend/frontend picture is still there. It's the **Group** column above.

## Where things go

| Thing | Goes in |
|---|---|
| The senior/PWD discount rule | `KVNsysCore/selling` |
| The "record a sale" call and what it carries | `KVNsysWire/selling` |
| Checking that this cashier may ring a sale | `KVNsysServer/selling` |
| Saving the sale to the database | `KVNsysPostgres/selling` |
| Keeping the cart while the cashier scans | `KVNsysClient/selling` |
| The big Pay button | `KVNsysUI` (the button) and `KVNsysClientApp/selling` (the screen it's on) |
| Printing the receipt | `KVNsysClientApp`, whose desktop side talks to the printer |

## The desktop app

`KVNsysClientApp` is built with **Electron**: React screens inside a private copy of Chrome, packed
into an ordinary Windows program with an installer and a desktop icon. It has two halves:

| Half | Does |
|---|---|
| The desktop side | Opens the window (full screen for a till), prints receipts without a dialog, opens the cash drawer, reads the PC's hardware id, and trusts only this branch's server |
| The screens | Everything the cashier sees, in React |

The client engine runs on the desktop side. The screens reach it only through a small bridge
(`desktop/bridge.ts`), and can't touch the network, the disk or the PC themselves.

Why Electron, and what it fixes compared with running in a browser:
[`docs/decisions.md`](docs/decisions.md).

## Tools

TypeScript everywhere, on Node 24 with pnpm workspaces.

| Project | Built with |
|---|---|
| `KVNsysServer` | NestJS |
| `KVNsysPostgres` | Prisma and PostgreSQL 16 |
| `KVNsysWire` | zod (the shape of each call, checked on both sides) |
| `KVNsysUI`, the screens | React, with shadcn/ui on Tailwind |
| `KVNsysClientApp`, `KVNsysServerApp` | Electron |

Folders keep their KVNsys names. Package names are lowercase (`@kvnsys/core`), because npm
requires it.

## Commands

Needs Node 24 and pnpm 10. Run from this folder:

| Command | Does |
|---|---|
| `pnpm install` | Installs every project's dependencies |
| `pnpm build` | Runs the guard, then compiles every project, inner ones first |
| `pnpm check:structure` | Runs only the guard |
| `pnpm test` | Runs every test project (after `pnpm build`) |
| `pnpm db:deploy` | Creates or updates the tables in the database named in `.env` |
| `pnpm seed` | Prepares a new install's database. Safe to run again. |
| `pnpm start:server` | Starts KVNsys Server on this PC and prints the address other PCs use to reach it. It needs its database (`DATABASE_URL` in `.env`). A database that doesn't exist yet it creates, and an empty one it sets up, asking once for the shop's name and an administrator's password; any other database must already be KVNsys's, or it refuses to start. |
| `pnpm start:app` | Opens KVNsys POS & Inventory on this PC |
| `pnpm package` | Builds everything, then makes the two programs in `out/`: `KVNsys POS & Inventory` (the app) and `KVNsys Server` (one `KVNsys Server.exe`), plus `KVNsys POS & Inventory Setup.exe`, the app as one setup file for a register, and `KVNsys Server Setup.exe` for the server PC. The server's setup file needs Inno Setup 7 on the building PC, and `pnpm fetch:installer-parts` run first. None of them needs Node or pnpm on the PC that runs it. |
| `pnpm install:here` | Installs those two programs on this PC, for the person signed in to Windows, with an icon for each on the desktop. Run it again after packaging again, with both programs closed. |
| `pnpm fetch:installer-parts` | Downloads what the server's setup file will carry into `vendor/`, which isn't committed: PostgreSQL 18.6 for Windows from EDB (unpacked), and Microsoft's Visual C++ runtime. Each file is checked against its recorded fingerprint. |

**Setting up a new install:** copy `.env.example` to `.env` and fill it in. Then run
`pnpm install`, `pnpm build`, `pnpm db:deploy` and `pnpm seed`, in that order.

**The installed programs.** Double-click **KVNsys Server** and it runs in its own window, showing
the address registers use; close the window to stop it. If something's wrong, such as no
database, it says what and waits for Enter before closing. It reads its settings from
`server.env`, beside its certificate in `C:\ProgramData\KVNsys\Server`, written like `.env`. On
this PC, `pnpm install:here` fills that in from `.env`. Windows may ask, the first time it starts,
whether to let it through the firewall: allow it on private networks, or other PCs can't reach it.
Double-click **KVNsys POS & Inventory** for the app.

**For the server PC:** copy `out\KVNsys Server Setup.exe` to it and double-click it. Windows asks
once for administrator rights, because services need them. On a new install, one page asks for the
shop's name and an administrator's password. Then it installs:
- Microsoft's Visual C++ runtime, if the PC lacks it
- its own PostgreSQL (port 5433, this PC only, passwords nobody sees)
- KVNsys Server
- a nightly backup of the shop's database

PostgreSQL and KVNsys Server both run as Windows services that start whenever the PC starts, so there's
no window or icon to open. One option, ticked by default, lets the shop's registers reach the server
through Windows Firewall, on private networks only. To remove it, use Windows' list of apps: the
programs, the services, the backup task and the firewall rule go, and the shop's data and backups stay
in `C:\ProgramData\KVNsys`. Installing again picks that data up, so the shop and its accounts are still
there.

**The nightly backup.** A Windows scheduled task, "KVNsys Nightly Backup", saves a copy of the
database to `C:\ProgramData\KVNsys\Backups` every night at 11 PM. If the PC was off at 11 PM, it makes
the copy soon after the PC next starts. It keeps the newest 14 copies, and only Administrators can open
them. What each night did is in `C:\ProgramData\KVNsys\Logs\backup.log`. To prove a copy can be put
back, run `C:\Program Files\KVNsys\Server\setup\check-backup.ps1` from an administrator PowerShell. It
restores the newest copy into a throwaway database, compares every table with the live one, and
removes the throwaway database again. The copies are on the same PC, so they don't survive that PC
dying; a USB copy is a later step.

**For a register:** copy `out\KVNsys POS & Inventory Setup.exe` to it, on a USB stick for example,
and double-click it. It installs the app for the person signed in to Windows, asking nothing and
needing no administrator rights. It puts an icon on the desktop and in the Start menu, then opens
the app. To remove it, use Windows' list of apps. The app's settings (which server it uses, and
which server it trusts) are kept, so a reinstall picks up where it left off.

**KVNsys's own PostgreSQL:** `scripts/postgresql/install-postgresql.ps1` installs it as a Windows
service: port 5433, answering on this PC only, with random passwords nobody sees. `remove-postgresql.ps1`
takes it away again, data too with `-RemoveData`. Both need administrator rights. They're part 1
of the server's setup file. See [`docs/server-setup-plan.md`](docs/server-setup-plan.md).

**A new install sets itself up.** Point the server at a PostgreSQL database and start it. If the
database doesn't exist yet, the server creates it, as long as its PostgreSQL account is allowed
to create databases (PostgreSQL's own `postgres` account is). On an empty database, it then
creates its tables and asks two questions, just this once: the shop's name, and a password
for the first administrator, `admin` (typed twice, shown as stars). No pnpm is needed. A database
that already holds someone else's tables is refused, never written into.

The database tests make their own throwaway database and drop it afterwards, so they never touch
an existing one. The app's tests do the same with its settings: each run gets a throwaway folder
(through `KVNSYS_APP_DATA`), never this PC's real one. They need `KVNSYS_TEST_POSTGRES_URL` in `.env`; without it they show as
skipped.

Until a test project has its first test, `pnpm test` says "No test files found" for it and passes.
Once every project has tests, drop `--passWithNoTests` from the test projects, so a misplaced test
file can't pass by going unnoticed.

Later, and only when they're wanted: a console face, a phone face, and more KVNsys programs
beside POS & Inventory.
