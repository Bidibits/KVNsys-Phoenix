# Server setup plan: KVNsys Server Setup.exe, with PostgreSQL inside

**Status: a plan only. Nothing here is built (2026-10-18).** It's for the partners to agree before
anyone builds it. The versions, support dates and the EDB package were checked on 18 October 2026
(sources at the end). Anything marked *check when building* is still unverified.

## What a person does at a branch

1. Copy `KVNsys Server Setup.exe` to the branch's server PC and double-click it.
2. Windows asks once for administrator rights. A Windows service can't be installed without them.
3. The setup installs PostgreSQL and KVNsys Server, starts them, and opens KVNsys Server's window.
   That window asks the two first-start questions (shop name, administrator password), which
   already exist.

Nothing about PostgreSQL is ever shown to anyone or asked of them.

## Which PostgreSQL

- **One major version, bundled.** Pick the newest one that has had at least one minor release
  (x.1 or later) when we build. Today that means 18, currently at 18.6. PostgreSQL 19 was only at
  its first release candidate on 15 October 2026, and by this rule it qualifies once 19.1 is out.
  Development and the tests move to the same major at the same time; they're on 16 now.
- **How long it lasts.** Each major gets five years of fixes: 16 until 9 November 2028, 17 until
  8 November 2029, 18 until 14 November 2030.
- **Minor updates** (18.1 → 18.2) come inside a newer setup file. They replace the program files and
  restart the service. The data isn't touched.
- **Major upgrades** (18 → 19) are a separate, deliberate step, done after a backup with
  PostgreSQL's `pg_upgrade`. A setup file never does one quietly.
- **The package:** the official PostgreSQL binaries for Windows that EDB publishes as an archive
  (Windows x86-64, 18.6 among them), not EDB's installer. EDB says the archive holds everything its
  installers install, so it has to be trimmed. Only what the server needs is kept: `bin`, `lib`,
  `share`, and the licence. No pgAdmin, no StackBuilder, no documentation.
- **The Visual C++ runtime.** It's very likely needed. PostgreSQL's Windows builds load Microsoft's
  Visual C++ 2015–2022 runtime (`vcruntime140.dll`), which EDB's installer puts in for you. So the
  setup carries Microsoft's x64 redistributable and runs it silently; that's harmless where it's
  already installed. *Check when building:* run `initdb` from the trimmed files on a clean Windows,
  first without the runtime, then with it.
- **Licence:** the PostgreSQL License is permissive, so bundling is allowed. Its licence file goes
  in with the install.

**Why not run EDB's installer silently instead:**
- It's bigger, and installs pgAdmin and StackBuilder unless told not to.
- It has its own uninstaller, separate from ours.
- It wants port 5432, where another program's PostgreSQL may already be.

Owning the steps is more work once, and fewer surprises at every branch.

## Where things live

| What | Where | Touched by updates? | Removed by uninstall? |
|---|---|---|---|
| PostgreSQL's programs | `C:\Program Files\KVNsys\PostgreSQL\18\` | Replaced | Yes |
| KVNsys Server's programs | `C:\Program Files\KVNsys\Server\` | Replaced | Yes |
| The shop's database | `C:\ProgramData\KVNsys\PostgreSQL\18\data\` | Never | **No** |
| KVNsys Server's settings and certificate | `C:\ProgramData\KVNsys\Server\` | Never | **No** |
| Backups | `C:\ProgramData\KVNsys\Backups\` | Never | **No** |

- **The settings move.** A service runs under no person's Windows account, so its settings have to
  be machine-wide. Today the server keeps them in `%LOCALAPPDATA%`; the step that builds this
  moves them to `C:\ProgramData\KVNsys\Server\`.
- **Who can read the data.** Only PostgreSQL's service account, SYSTEM and Administrators can read
  the data folder.
- **Backups:** nightly backups and the USB copy are their own step. The folder is planned here so
  it's in the right place from the start.

## Accounts and passwords

PostgreSQL gets two accounts. The setup makes a long random password for each, and nobody ever sees
either one.

| Account | What it's for | Rights |
|---|---|---|
| `postgres` | Setup, upgrades and backups only | Superuser |
| `kvnsys` | What KVNsys Server signs in as | Owns the `kvnsys` database. Not a superuser, can't create databases. |

- **The `postgres` password** is stored encrypted for this PC (Windows DPAPI, machine scope) in
  `C:\ProgramData\KVNsys\PostgreSQL\`, readable only by Administrators and SYSTEM.
- **The `kvnsys` password** goes into KVNsys Server's settings. Today that file is plain text; the
  step that builds this encrypts it the same way. Release encrypted its config with AES; DPAPI is
  Windows' built-in equivalent.
- **Sign-in method:** passwords are checked with `scram-sha-256`, nothing weaker.
- **The database answers only on the server PC itself:** `listen_addresses = 'localhost'`, and
  `pg_hba.conf` allows only `127.0.0.1` and `::1`. Registers never talk to PostgreSQL. They talk to
  KVNsys Server, which is the only thing that does.

## Port

KVNsys's PostgreSQL listens on **5433**, not the usual 5432, so it can never collide with another
program's PostgreSQL on the same PC. If 5433 is taken, the setup takes the next free port and
writes it into the settings.

## Running as a Windows service

- **PostgreSQL.** It's registered with PostgreSQL's own tool, as a portable PostgreSQL 18 has been
  shown to work:
  `pg_ctl register -N kvnsys-postgresql -D <data folder> -o "-p 5433" -S auto`
  - It has to run with administrator rights, which the setup has anyway.
  - Service "KVNsys PostgreSQL" (`kvnsys-postgresql`) starts automatically.
  - It runs as a virtual service account (`NT SERVICE\kvnsys-postgresql`) that can only reach its
    own data folder. *Check when building* that `pg_ctl register` accepts that account; nothing
    found confirms or rules it out. If it doesn't, fall back to NetworkService, which is what EDB's
    installer uses.
  - If it stops unexpectedly, Windows restarts it.
  - On its own, a PostgreSQL service logs to Windows' Event Viewer. Turn `logging_collector` on so
    the logs land as files in the data folder's `log` folder, where someone helping a branch can
    find them.
- **KVNsys Server** becomes a service in its own later step, "starts with Windows". A Node
  program can't answer Windows' service manager by itself, so it needs a small wrapper (WinSW is
  the first candidate). Until then, the setup opens it the way the desktop icon does today.
- **Windows Firewall.** The setup adds one inbound rule, for KVNsys Server's port (9000), on private
  networks only. There's no rule for PostgreSQL, because nothing outside the PC should reach it.

## What the setup does, in order

1. Check: Windows 10 or 11 64-bit, administrator rights, enough disk space, and a free port.
2. Copy the program files.
3. Install Microsoft's Visual C++ runtime silently. That's harmless where it's already installed.
4. **If there's no data folder yet:** run `initdb` with UTF-8 encoding, so names like Peñaranda
   work, and with `scram-sha-256` sign-in. The random `postgres` password goes in through a
   temporary file that's deleted straight after.
5. Write `postgresql.conf` (the port, localhost only) and `pg_hba.conf` (localhost only).
6. Register the PostgreSQL service and start it.
7. Create the `kvnsys` account and the `kvnsys` database it owns.
8. Write KVNsys Server's settings (`DATABASE_URL`, the port), encrypted.
9. Start KVNsys Server. It sets up its tables and asks its two questions; that part is already built.

**A data folder that already exists is kept and used, never initialised again.** That's what makes
reinstalling or updating safe.

## Uninstalling

Uninstalling removes the programs and the services, but keeps the data folder, the settings and the
backups, and says where they are. Deleting a shop's data takes a deliberate second step: a separate
"remove all data" option that's off unless someone ticks it.

## Building the setup file

- **Tool.** electron-builder only makes setup files for Electron apps, and KVNsys Server isn't one.
  **Recommended: Inno Setup.** It's free and mature, and built for exactly this: administrator
  installs, services, and a proper uninstaller. Its compiler is a one-time install on the build
  PC, and `pnpm package` would call it. The alternative is a hand-written NSIS script.
- *Check when building:* the setup file's compressed size. A rough guess is PostgreSQL at 50–100 MB
  plus the server at about 30 MB.

## Open, for the partners

| Question | Who decides |
|---|---|
| Installing the server needs administrator rights once (a service requires it). Is that fine? | The partners |
| The `postgres` password: only stored encrypted on the PC (planned), or also written on paper and kept by the owners? | The owners |
| Nightly backup: which USB stick, who swaps it, and who checks that a restore works | The partners, with the branch manager |
| PostgreSQL 18 everywhere, development included (moving off 16) | The partners |

## Sources (checked 18 October 2026)

- PostgreSQL versions and support dates: [postgresql.org/support/versioning](https://www.postgresql.org/support/versioning/)
- The Windows binaries: [EDB, PostgreSQL binaries](https://www.enterprisedb.com/download-postgresql-binaries)
- `pg_ctl register` with a portable PostgreSQL 18: [notepad.onghu.com](https://notepad.onghu.com/2026/portable-postgresql-on-windows-service-pg18/), and the [pg_ctl documentation](https://www.postgresql.org/docs/17/app-pg-ctl.html)
