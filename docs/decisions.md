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
| 2026-10-17 | ~~**Plain CSS in `KVNsysUI`** for now~~ Replaced on 2026-10-18 by shadcn/ui, below | No styling framework had been chosen. One stylesheet was easy to swap later, and it was. |
| 2026-10-17 | **Playwright drives the real app in tests:** it opens the window, types, clicks and reads what appears | Only running the real window shows whether the window works |
| 2026-10-17 | **Connecting never crashes on an expected problem.** A bad address, nothing there, not a KVNsys Server, or a protocol mismatch each comes back as a plain-words message, and a mismatch names which side to update. It gives up after 5 seconds. | A manager setting up a register needs to know what to fix, not see an error code |
| 2026-10-17 | **The default port lives in `KVNsysWire`**, shared by client and server | So the two can't disagree about it |
| 2026-10-17 | **KVNsys Server listens on port 9000** by default (`KVNSYS_PORT`), on every network address of the PC | 9000 is the port the old KVNsys used. Listening on every address is what lets registers on the shop's network reach it. |
| 2026-10-17 | **The first call is "hello":** what the server is, its version, and its protocol number. A client and a server only talk when their protocol numbers match. | A branch that updated one side but not the other gets a clear message instead of strange errors |
| 2026-10-17 | **HTTPS only, with the server's certificate pinned by the app.** The server makes a self-signed certificate on first start and keeps it. The app trusts the first one it meets at an address and refuses any other there, checking the exact fingerprint during the handshake, before anything is sent. Plain HTTP gets no answer at all. | No certificate authority reaches a shop with no internet. Trust on first use, then pinning, is what the old KVNsysWire did. |
| 2026-10-18 | **A password only ever goes to a server this register already trusts.** Never on a first contact, and never to a server showing another certificate: that's refused during the handshake, before the password leaves the PC. Tested by stand-in servers that must receive nothing. | Trust on first use is fine for "hello"; it would be reckless for a password |
| 2026-10-18 | ~~**No sessions yet.**~~ Replaced the same day by sessions, below | |
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
| 2026-10-18 | **shadcn/ui, on Tailwind, is the base of `KVNsysUI`.** Its parts are copied into `KVNsysUI/components/ui` and from then on are our code. KVNsys's own parts (`Panel`, `TextField`, `Button`, `Notice`) are built on them, and screens use ours. More parts come in as screens need them, with Beta's component library as the checklist. | Ready-made parts that already handle the keyboard, focus and screen readers, instead of writing each one. Copied in rather than installed, so an update can't change them under us and any of them can be edited. The touch sizes stay KVNsys's: 56px boxes and buttons, 20px typing. |
| 2026-10-18 | **shadcn's helpers are pinned like everything else:** `cn` 0.5.0, `radix-ui` 1.8.1, `class-variance-authority` 0.7.1, Tailwind 4.3.3, `tw-animate-css` 1.4.0 | `cn` is shadcn's own class-merging package, which its command-line tool now uses instead of writing a `utils.ts`. It isn't a typo. |
| 2026-10-18 | **`KVNsysUI` is used as source:** an app imports its `.tsx` files and compiles them in its own build; `KVNsysUI`'s own build only type-checks | A shadcn part is meant to be edited where it lives, and the app's build compiles React files anyway. A separately compiled copy would be one more thing to keep in step. |
| 2026-10-18 | **Sessions.** A sign-in hands back a pass (32 random bytes), good for 12 hours. Later requests show it as `Authorization: Bearer <pass>`; `GET /api/session` says whose it is. Signing out (`POST /api/sign-out`) cancels it, and signing out twice, or with a pass that's already gone, still counts as signed out. | Release did the same: a 32-byte token per login, removed at logout. HTTP keeps no connection open, so the pass is the sign-in. 12 hours covers a long shift. |
| 2026-10-18 | **The server keeps passes in its memory, only as hashes, and a restart ends every session** | Nothing to clean up in the database, and nothing read out of the server's memory can be used as a pass. Registers sign in again after a restart. |
| 2026-10-18 | **The pass stays on the app's desktop side, in memory only.** The screens are never handed it, it's never written to disk, and closing the app drops it (the server forgets it within 12 hours). Like a password, it only ever goes to the pinned server, and the request code itself refuses to send it anywhere else. | A screen that went wrong can't leak what it never had |
| 2026-10-18 | **Protocol 3:** sessions | An updated app needs an updated server, and the protocol number is how they find out |
| 2026-10-18 | **What sessions don't do yet**, from Release's checklist: sign-ins aren't recorded in an audit log (there isn't one yet), a pass doesn't say which register it's on (registering machines isn't built), the server can't list or cut off sessions, and switching an account off doesn't end its passes | Each comes with the step that needs it |
| 2026-10-18 | **`pnpm package` makes the two programs, and neither needs Node on its PC.** The app is packaged with Electron's own packager, its desktop side bundled into one file first (esbuild), so the package carries no `node_modules`. The server is one `KVNsys Server.exe`: Node's single-executable form, with the server bundled inside. | Double-click to run. A console window is the smallest honest face for a server today; its own window (`KVNsysServerApp`) can come later. Bundling sidesteps pnpm's linked `node_modules`, which packagers copy badly. |
| 2026-10-18 | **`pnpm install:here` installs both for the signed-in Windows user,** in `%LOCALAPPDATA%\Programs\KVNsys`, with a desktop icon each. It only ever replaces its own earlier copy. | No administrator rights needed. Run again after each `pnpm package`. |
| 2026-10-18 | **The server reads `server.env`, beside its certificate** in `%LOCALAPPDATA%\KVNsys\Server`, written like `.env`. A setting already in the environment wins, so running from source is unchanged. On this PC, `install:here` copies the database lines from `.env` into it without showing them. | An installed server can't see the source folder's `.env` |
| 2026-10-18 | **A double-clicked server that hits a problem says what, then waits for Enter** | Otherwise its window closes before anyone can read why |
| 2026-10-18 | **What packaging doesn't do yet:** the database password in `server.env` is plain text (Release encrypted it); the programs aren't signed (putting the server inside Node's exe breaks Node's own signature, hence postject's "signature seems corrupted" warning, which is expected); there are no KVNsys icons (the server shows Node's); the server doesn't start with Windows; there's no setup file for another PC; and PostgreSQL itself still has to be installed (the server makes and sets up its own database, below) | Each comes with the step that needs it |
| 2026-10-18 | **The server sets up an empty database itself.** At start, a database with no tables at all gets every update the server ships with, applied by its own runner (`applyDatabaseUpdates` in `KVNsysPostgres`, over `pg`) and recorded exactly the way Prisma records them: same table, same checksums. A test sets one database up each way and compares them table for table. A database holding anyone else's tables is refused, never written into. | An installed server has no pnpm and no Prisma tool. It all happens in one transaction, so a failure leaves the database empty, not half set up. |
| 2026-10-18 | **A brand-new install asks two questions, once:** the shop's name, and a password for the first administrator, typed twice and shown as stars at a keyboard. They're only asked while nobody can sign in, so never again after that. The shop's code is HQ and the username `admin`, as `pnpm seed` already had it. Answers can also come down a pipe, one per line, for scripts and tests. | They're the only things a new install can't guess. A typo in the first password would lock the shop out, because there's no other administrator to reset it. |
| 2026-10-18 | **A database that doesn't exist yet gets created,** empty, then set up like any empty one. The server makes it through PostgreSQL's own `postgres` database. The PostgreSQL account in `DATABASE_URL` has to be allowed to create databases; if it isn't, the server says exactly that and stops. Any other trouble reaching PostgreSQL is still explained by the usual check. | One less thing to do in pgAdmin at a new install |
| 2026-10-18 | **What first-start setup doesn't do yet:** bring a database that's missing newer updates up to date (that's still `pnpm db:deploy`); give a shop any code but HQ (a second shop will need its own before anything moves between shops); or start where nothing can be typed, such as a Windows service (it stops and says why) | Each comes with the step that needs it |
| 2026-10-18 | **A register gets the app from one setup file,** `KVNsys POS & Inventory Setup.exe`, which `pnpm package` makes with electron-builder (NSIS, one-click, per person). It installs to `%LOCALAPPDATA%\Programs\kvnsys-pos-inventory` without asking anything or needing administrator rights, adds a desktop and a Start menu icon, and lists the app in Windows' list of apps with an uninstaller. Uninstalling keeps the app's settings. The app id, `com.kvnsys.pos-inventory`, must never change. | Double-click, nothing to answer, no administrator: as easy as an install gets. electron-builder only wraps the app `pnpm package` already makes, so the app itself is built one way. A changed app id would install a second copy beside the first. |
| 2026-10-18 | **What the setup file doesn't do yet:** it isn't signed, which is fine from a USB stick but means Windows warns about an unknown publisher on a download; it shows Electron's icon; and it doesn't update itself, so a newer setup file is installed over the old one. On a developer's PC, `install:here` and the setup file install to different folders. | Each comes with the step that needs it |

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
| Should pressing Sign in again clear the server's last answer? Today "Wrong username or password." stays up beside "Type your password.", and on a first connection the screen then scrolls (it did with the old styling too) (found 2026-10-18) | The partners. It's one line of the sign-in screen. |
| Type-check the tests. Nothing runs `tsc` on them and the test projects have no Node type definitions, so a type mistake in a test goes unnoticed (found 2026-10-18) | Offered as its own task |
| How a branch installs KVNsys. Recommended: one setup file per PC, the server's bringing PostgreSQL and setting up its own database, and no Docker (the 2026-10-16 structure plan already said no Docker on branch PCs: on Windows it also brings in WSL and virtualization, and a shop can't fix it when it breaks) (asked 2026-10-18) | The partners |

## How we work

- **Build one step at a time, and say everything a step includes before starting it.**
- **Nobody merges their own pull request.** The other partner reviews it.
- **Split work by business area** (for example selling vs catalog). Each area has its own folder
  inside every project, so two people rarely touch the same file.
- **A check that can't fail isn't a check.** Make every rule and test fail once on purpose. A
  structure check written for an earlier version of Phoenix passed while three of its five rules
  could never fire.
- **A test that can't run shows as skipped, never as passed.**
- **Assert the rule, not today's number.** A test pinned the protocol at exactly 2, and broke the
  moment sessions rightly raised it. It now checks that sign-in came with 2 or later.

## Learned the hard way

- **Electron's main file opens the window with `app.whenReady().then(...)`, never a top-level
  `await app.whenReady()`.** The top-level version never finishes under Playwright. That was
  confirmed by switching it back and watching the test fail.
- **A message that exists isn't a message a person can see.** The first sign-in screen put "Wrong
  username or password." below the fold of a short window. Every test passed, because the message
  was there; only a screenshot showed it was cut off. Errors now sit above the fields.
- **A layout checked by eye isn't checked.** This file then said the worst case (a first
  connection plus an error) was "checked for scrolling". It had only been looked at once. The
  switch to shadcn made that screen 3px too tall and all 114 tests stayed green; screenshots
  caught it. A test now measures it, and was made to fail once, at 684px in a 681px window.
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
