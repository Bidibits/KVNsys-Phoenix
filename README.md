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
  this PC as its first machine, three roles and the first admin.
- **KVNsys Server starts and answers on the shop's network.** Other PCs can ask it what it is,
  which version it is, and which protocol it speaks. It does nothing else yet: no sign-in, no
  screens. For now it's started by hand; starting with Windows comes later.
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
- **Every connection is HTTPS, and the app knows its server.** The server makes its own security
  certificate the first time it starts, and keeps it. The app trusts the first certificate it meets
  at an address, and from then on refuses any other there. So a different machine answering at the
  server's address, an impostor, is turned away before anything is sent.

Everything else is still to come.

**For IT:**
- The server's certificate is in `%LOCALAPPDATA%\KVNsys\Server` (or `KVNSYS_SERVER_DATA`) on the
  server PC. Back it up: if it's lost, every register has to be reset.
- To reset a register's trust, for example after replacing the server PC, delete
  `trusted-servers.json` in `%APPDATA%\KVNsys POS & Inventory` on that register. It will then
  trust the next server it connects to.
- The server prints its certificate fingerprint when it starts, so the first connection can be
  checked against it. The schema (five tables and their first migration) is in
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
| `pnpm start:server` | Starts KVNsys Server on this PC and prints the address other PCs use to reach it. It needs its database (`DATABASE_URL` in `.env`), set up with `pnpm db:deploy` and `pnpm seed`, and refuses to start without it. |
| `pnpm start:app` | Opens KVNsys POS & Inventory on this PC |
| `pnpm package` | Builds everything, then makes the two programs in `out/`: `KVNsys POS & Inventory` (the app) and `KVNsys Server` (one `KVNsys Server.exe`). Neither needs Node or pnpm on the PC that runs it. |
| `pnpm install:here` | Installs those two programs on this PC, for the person signed in to Windows, with an icon for each on the desktop. Run it again after packaging again, with both programs closed. |

**Setting up a new install:** copy `.env.example` to `.env` and fill it in. Then run
`pnpm install`, `pnpm build`, `pnpm db:deploy` and `pnpm seed`, in that order.

**The installed programs.** Double-click **KVNsys Server** and it runs in its own window, showing
the address registers use; close the window to stop it. If something's wrong, such as no
database, it says what and waits for Enter before closing. It reads its settings from
`server.env`, beside its certificate in `%LOCALAPPDATA%\KVNsys\Server`, written like `.env`. On
this PC, `pnpm install:here` fills that in from `.env`. Windows may ask, the first time it starts,
whether to let it through the firewall: allow it on private networks, or other PCs can't reach it.
Double-click **KVNsys POS & Inventory** for the app.

The database tests make their own throwaway database and drop it afterwards, so they never touch
an existing one. The app's tests do the same with its settings: each run gets a throwaway folder
(through `KVNSYS_APP_DATA`), never this PC's real one. They need `KVNSYS_TEST_POSTGRES_URL` in `.env`; without it they show as
skipped.

Until a test project has its first test, `pnpm test` says "No test files found" for it and passes.
Once every project has tests, drop `--passWithNoTests` from the test projects, so a misplaced test
file can't pass by going unnoticed.

Later, and only when they're wanted: a console face, a phone face, and more KVNsys programs
beside POS & Inventory.
