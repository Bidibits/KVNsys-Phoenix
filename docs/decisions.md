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
| 2026-10-17 | **The app remembers the last server it connected to**, in `settings.json` in Windows' app-data folder for the signed-in account (`%APPDATA%\KVNsys POS & Inventory`) | A register is usually one Windows account, and that's where Windows keeps a program's settings. A PC with several accounts sets it up once per account. |
| 2026-10-17 | **Only a successful connect is saved.** A failed attempt never replaces the saved address, a damaged settings file counts as "nothing remembered" rather than a crash, and the file is written to a side file first and then swapped in. | A server that's switched off shouldn't make a register forget it, and a power cut mid-save shouldn't stop the app starting |
| 2026-10-17 | **The client engine runs on the app's desktop side; the screens ask through a narrow bridge.** | The screens never cross from their own files to the server, so there are no browser cross-site rules to fight. The PC's hardware id and the server's pinned certificate belong on the desktop side anyway. And a screen that went wrong couldn't reach the PC. |
| 2026-10-17 | **The window is an app, never a browser:** no menu bar, no opening other windows, no wandering to another page, and no Node access for the screens (Electron's sandbox) | |
| 2026-10-17 | **Plain CSS in `KVNsysUI`** for now | No styling framework has been chosen. One stylesheet is easy to swap later. |
| 2026-10-17 | **Playwright drives the real app in tests:** it opens the window, types, clicks and reads what appears | Only running the real window shows whether the window works |
| 2026-10-17 | **Connecting never crashes on an expected problem.** A bad address, nothing there, not a KVNsys Server, or a protocol mismatch each comes back as a plain-words message, and a mismatch names which side to update. It gives up after 5 seconds. | A manager setting up a register needs to know what to fix, not see an error code |
| 2026-10-17 | **The default port lives in `KVNsysWire`**, shared by client and server | So the two can't disagree about it |
| 2026-10-17 | **KVNsys Server listens on port 9000** by default (`KVNSYS_PORT`), on every network address of the PC | 9000 is the port the old KVNsys used. Listening on every address is what lets registers on the shop's network reach it. |
| 2026-10-17 | **The first call is "hello":** what the server is, its version, and its protocol number. A client and a server only talk when their protocol numbers match. | A branch that updated one side but not the other gets a clear message instead of strange errors |
| 2026-10-17 | **HTTPS only, with the server's certificate pinned by the app.** The server makes a self-signed certificate on first start and keeps it. The app trusts the first one it meets at an address and refuses any other there, checking the exact fingerprint during the handshake, before anything is sent. Plain HTTP gets no answer at all. | No certificate authority reaches a shop with no internet. Trust on first use, then pinning, is what the old KVNsysWire did. |
| 2026-10-18 | **A password only ever goes to a server this register already trusts.** Never on a first contact, and never to a server showing another certificate: that's refused during the handshake, before the password leaves the PC. Tested by stand-in servers that must receive nothing. | Trust on first use is fine for "hello"; it would be reckless for a password |
| 2026-10-18 | **No sessions yet.** Signing in checks the password and shows who it is; the server doesn't remember anyone, and signing out only returns to the sign-in screen. | Sessions come with the first thing that needs to know who's asking |
| 2026-10-18 | **The app's window opens at 1024×720** and a screen's panel is 540 wide, so a whole screen fits without scrolling | 720 still fits a 768-pixel register screen with the Windows taskbar |
| 2026-10-17 | **A certificate is trusted only after the server proves to be a KVNsys Server this app can talk to.** Nothing else ever gets pinned. | A router or another device at a typed address must never become "trusted" |
| 2026-10-17 | **The trusted-servers file is stricter than the settings file:** missing means "trusts nobody yet", but damaged means "connect to nothing until IT checks". | Quietly forgetting the pins would let an impostor be trusted as a first contact. The old KVNsys learned this one. |
| 2026-10-17 | **The server's certificate is valid 2000–2099, and marked as its own authority** | A register with a dead clock battery still connects; trust comes from the fingerprint, not the dates. Electron's TLS needs the authority mark; see below. |
| 2026-10-17 | **If one of the server's two certificate files goes missing, it refuses to start** rather than make a new identity | A new identity means every register refuses the server until IT resets them, so it's never done quietly |
| 2026-10-17 | **Sign-in answers yes or no.** Yes comes with the person's name and role; no comes with a plain reason (400 nothing typed, 401 wrong, 403 switched off). A wrong password and an unknown username get the same answer and take the same time. "Switched off" is only said once the password is right. | Sign-in mustn't help anyone guess which usernames exist |
| 2026-10-17 | **Protocol 2:** sign-in was added | A new app needs a server that knows sign-in, and the protocol number is how they find out |
| 2026-10-17 | **The server refuses to start unless its database has exactly the KVNsys updates it ships with.** It reads the record Prisma keeps of applied updates and compares it with its own list. It tells apart: can't reach, not set up, missing updates, and updates it doesn't recognise. | The first version only looked for a `users` table, and started happily against another program's database on this PC that had one |
| 2026-10-17 | **The seed** creates the location, this PC as machine `<code>-SRV`, the three default roles and the first admin, all in one transaction. It's safe to run again, and it never creates a second admin. Seeded rows are stamped as written by nobody, on this PC, at this location. | A new install has no users, so nobody could sign in to create the first one |
| 2026-10-17 | **Core describes what it needs; other projects provide it.** For example `SetupStore` and `PasswordHasher` are defined in `KVNsysCore`, provided by `KVNsysPostgres` and `KVNsysServer` | The rules never depend on the database or on how passwords are scrambled. Release did the same. |
| 2026-10-17 | Settings use the `KVNSYS_` prefix | "Phoenix" is only the folder name |
| 2026-10-17 | **Database tests make their own throwaway database** and drop it afterwards | They can never damage a real one |
| 2026-10-17 | **The guard:** dependency-cruiser checks the README's "who may use whom" table on every `pnpm build`, exactly as written, and stops the build when a rule is broken | Rules that live only on paper erode quietly. Each of its 12 rules was proven by planting a mistake for it. |
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

## Learned the hard way

- **Electron's main file opens the window with `app.whenReady().then(...)`, never a top-level
  `await app.whenReady()`.** The top-level version never finishes under Playwright. That was
  confirmed by switching it back and watching the test fail.
- **A message that exists isn't a message a person can see.** The first sign-in screen put "Wrong
  username or password." below the fold of a short window. Every test passed, because the message
  was there; only a screenshot showed it was cut off. Errors now sit above the fields, and the
  worst case (a first connection plus an error) is checked for scrolling.
- **Electron's TLS is stricter than Node's.** Electron uses BoringSSL, and it won't accept a pinned
  certificate as a trust anchor unless the certificate is marked as an authority. Plain Node
  (OpenSSL) accepts it either way, so every engine test passed while the real app couldn't
  reconnect. Only restarting the real app caught it.
- **"Is there a users table?" doesn't prove a database is yours.** Another program's database on
  this PC had one, and the server started against it. Check the record of applied updates instead.
- **The same failure can arrive in different shapes.** "Nothing at that port" came back as a bare
  `ECONNREFUSED` for `localhost`, and as a sentence wrapped in Prisma's header for `127.0.0.1`.
  Both now come out as words a person can act on.
- **On Windows, never pass a folder path ending in `\` as a program argument.** Before the closing
  quote it reads as an escaped quote, and the program gets a broken path.
