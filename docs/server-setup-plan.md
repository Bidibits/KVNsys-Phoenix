# Server setup plan: KVNsys Server Setup.exe, with PostgreSQL inside

**Status (2026-10-18): all 3 parts are built and tested, and the nightly backup with them.**
- Part 1: `scripts/postgresql/install-postgresql.ps1` installs KVNsys's own PostgreSQL as a Windows
  service, and `remove-postgresql.ps1` takes it away again.
- Part 2: `KVNsys Server Setup.exe` (`scripts/server-setup/kvnsys-server.iss`) wraps that and KVNsys
  Server into one setup file.
- Part 3: KVNsys Server runs as a Windows service through WinSW, and the setup asks the shop's name
  and the administrator's password on its own page.
- The nightly backup: a scheduled task saves the database every night and keeps 14 copies, and
  `check-backup.ps1` proves a copy can be put back. See "The nightly backup".

All of it was run for real on the development PC.

It's still for the partners to agree. The versions, support dates and the EDB package were checked on
18 October 2026 (sources at the end), and the part 1 test settled the rest. See "What the part 1
test settled".

## What a person does at a branch

1. Copy `KVNsys Server Setup.exe` to the branch's server PC and double-click it.
2. Windows asks once for administrator rights. A Windows service can't be installed without them.
3. On a new install, one page asks the shop's name and an administrator's password.
4. The setup installs PostgreSQL, KVNsys Server and the nightly backup, and starts them. Both run as
   Windows services from then on, so there's no window to open.
   *(Changed 2026-10-27: the setup now also installs the server's dashboard, with a desktop icon, and
   leaves the server off until it's turned on there; see `decisions.md`.)*

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
- **The Visual C++ runtime is needed** (settled). `postgres.exe` loads `VCRUNTIME140.dll`, and EDB's
  zip carries none of the runtime's files. So the setup carries Microsoft's x64 redistributable and
  runs it silently, which is harmless where it's already installed.
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
- **Backups:** the nightly backup writes here (see "The nightly backup"). Only Administrators and
  SYSTEM can open the folder. The USB copy is its own later step.

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
    own data folder. Settled: `pg_ctl register` accepts it, and the service ran under it. The script
    still falls back to NetworkService, which EDB's installer uses, if a PC ever refuses it.
  - If it stops unexpectedly, Windows restarts it.
  - On its own, a PostgreSQL service logs to Windows' Event Viewer. Turn `logging_collector` on so
    the logs land as files in the data folder's `log` folder, where someone helping a branch can
    find them.
- **KVNsys Server** runs as a service through WinSW (part 3), because a Node program can't answer
  Windows' service manager by itself.
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

## What the part 1 test settled (2026-10-18)

The install script, run for real on the development PC next to its own PostgreSQL 16:

- **The programs:** after trimming they take **141 MB**. The zip unpacks to about 870 MB, 684 MB of
  that pgAdmin.
- **The data folder:** `initdb` used PostgreSQL's own text rules (`--locale-provider=builtin`,
  `C.UTF-8`), which work the same on every PC whatever Windows' language setting. Data checksums are on.
- **Rights:** `initdb` drops administrator rights before it runs. So its one-time password file has
  to be readable by the account running the setup, not only by Administrators.
- **The service:** "KVNsys PostgreSQL" starts automatically, restarts if it stops, runs as
  `NT SERVICE\kvnsys-postgresql`, and listens on `127.0.0.1` and `::1` only.
- **The stored `postgres` password:** an ordinary account can't read the file it's kept in.
- **Running it again** keeps the data folder, reads the stored password back, gives `kvnsys` a fresh
  password and rewrites the settings.
- **KVNsys Server:** the installed program, given the settings the script wrote, set up its tables
  as `kvnsys` (not a superuser), asked its two questions and started. The admin signed in.
- **Removing it** with `-RemoveData` took away the service, both folders and the port, and nothing
  else.
- **A bug the test caught:** the settings file's comment and the `DATABASE_URL` line came out on one
  line, so the server would never have found its database. That PowerShell trap is fixed.

## What the part 2 test settled (2026-10-18)

- **The setup file** is 78 MB: about 250 MB of server, PostgreSQL and runtime, compressed.
- **A silent install as administrator** (`/VERYSILENT`) worked:
  - It put the programs in `C:\Program Files\KVNsys`, and the script then found PostgreSQL's
    programs already in place, so it didn't copy them again.
  - It created the service, wrote `C:\ProgramData\KVNsys\Server\server.env`, added the desktop and
    Start menu icons, and listed "KVNsys Server 0.1.0" in Windows' list of apps.
  - It skipped the Visual C++ runtime, because the PC already had a newer one.
- **KVNsys Server, started as its icon starts it,** found its settings in the new machine-wide
  folder. It brought the old certificate over, set up its database, asked its two questions, and the
  admin signed in.
- **Uninstalling** removed the service, `C:\Program Files\KVNsys`, both icons and the app list entry.
  It kept the database, the stored password, and the server's settings and certificate.
- Not tried: installing again over the kept data. Part 1's test covered the script's reuse path,
  which is the same.

## What the part 3 test settled (2026-10-18)

- **A silent install** (`/ShopName` and `/AdminPassword` standing in for the page, firewall option
  off) worked:
  - `KVNsys Server.exe --set-up` made the database and the shop.
  - Both services run automatically, under `NT SERVICE\kvnsys-postgresql` and `NT SERVICE\kvnsys-server`.
    WinSW accepts that kind of account, so the LocalService fallback wasn't needed.
  - The server listens on port 9000, starts after PostgreSQL, and restarts if it stops.
- **The first try failed, in two ways the test caught:**
  - The folder lock-down left `server.env` readable by nobody.
  - The server, having failed, waited for an Enter key that a service can never receive, while Windows
    reported it as running.

  Both are fixed. The setup now also repairs the folder's permissions before writing to it.
- **Installing again over that install** stopped the services, replaced the programs, kept the
  database and the shop (no shop page, no questions), and started the service.
- **The installed register app** connected to the server running as a service and signed in with the
  first install's password. An ordinary account can't read the settings folder.
- **Uninstalling** removed both services, the programs and the app list entry, and kept the data.
- Not tried: the firewall option (left unticked), and a real restart of the PC.

## The nightly backup (2026-10-18)

- **When:** a Windows scheduled task, "KVNsys Nightly Backup", runs every night at 11 PM as SYSTEM.
  If the PC was off at 11 PM, it runs soon after the PC next starts, and waits up to five minutes for
  PostgreSQL to answer.
- **What:** `backup-database.ps1` saves the whole `kvnsys` database with `pg_dump --format=custom`,
  one file per copy, `kvnsys-<date>-<time>.dump`, in `C:\ProgramData\KVNsys\Backups`. It signs in as
  `kvnsys` with the server's own settings, so it can read the shop's data and nothing else.
- **Only whole copies count:** a copy is written under a temporary name, read back in full
  (`pg_restore` to NUL), and only then given its real name. A copy cut short by a full disk or a power
  cut never stands in for a good one.
- **Keeping 14:** after a good copy, all but the newest 14 are deleted. A failed night deletes
  nothing. The copy just made always stays, even if the PC's clock has gone wrong, and the log then
  asks whether the date is right.
- **Who can open them:** Administrators and SYSTEM only. A copy holds the whole shop, including the
  accounts (passwords only as scrypt hashes).
- **The record:** one line a night in `C:\ProgramData\KVNsys\Logs\backup.log`. Don't rely on Task
  Scheduler's "last run time": after the task is re-registered (every reinstall does that), runs
  happen without updating it.
- **Checking a copy:** `check-backup.ps1`, from an administrator PowerShell, restores the newest copy
  (or the one named) into a throwaway database. It compares every table with the live database, by
  row count and a fingerprint of every row, then drops the throwaway database. Differences are normal
  once the shop has used KVNsys since the copy; `-RequireMatch` makes them a failure, for tests.
- **Uninstalling** removes the task and keeps the copies.
- **Not yet:** a copy that leaves the PC (the USB copy), and a restore that replaces the live database
  (the launch plan's week 8).

## What the backup test settled (2026-10-18)

- **A dry run** on the development PC, against a throwaway database on its own PostgreSQL 16 with
  16's tools, passed all 18 checks:
  - A copy is made and read back. A half copy fails the read-back.
  - 14 are kept, the oldest go first, and a copy dated 2030 doesn't push out the new one.
  - Files that aren't copies are left alone, and no password reaches a log.
  - A fresh copy restores and matches. After a change to the live database, the check names the
    changed table.
- **The real test**, run once with administrator rights (21 checks, 20 passed), went through:
  - Install: the task is registered as SYSTEM, daily at 23:00, catching up after a missed night. The
    folder and the copies are for Administrators and SYSTEM only.
  - Windows ran it, and the copy restored on PostgreSQL 18.6 and matched the live database row for row.
  - Installing again replaced the task (still one), kept the copy, and a second night ran and matched
    too, though the `kvnsys` password had changed with the reinstall.
  - Uninstalling removed the task and both services and kept both copies. The PC was then cleaned
    back to how it was.
- **The one failed check was the test's, not the backup's.** The test watched Task Scheduler's "last
  run time" to see the second run finish, and after a re-registration that time doesn't move. A
  separate probe started a task four times: four runs, one frozen time.
- Not tried: a night with the PC off (the catch-up after startup), and a real restart.

## Building the setup file

- **Tool.** electron-builder only makes setup files for Electron apps, and KVNsys Server isn't one.
  **Recommended: Inno Setup.** It's free and mature, and built for exactly this: administrator
  installs, services, and a proper uninstaller. Its compiler is a one-time install on the build
  PC, and `pnpm package` would call it. The alternative is a hand-written NSIS script. Inno Setup
  **7.1.0** (12 August 2026) is installed on the development PC, for that account only, at
  `%LOCALAPPDATA%\Programs\Inno Setup 7`.
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
