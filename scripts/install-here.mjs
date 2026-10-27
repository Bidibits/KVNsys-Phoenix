// `pnpm install:here`: installs the two programs `pnpm package` made on this PC, for the person
// signed in to Windows, and puts their icons on the desktop. Run it again after packaging again.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'out');
// Per person, like any program installed without asking for administrator rights.
const programs = join(process.env.LOCALAPPDATA, 'Programs', 'KVNsys');

const apps = [
  { name: 'KVNsys Server', exe: 'KVNsys Server.exe', description: 'Starts KVNsys Server on this PC' },
  { name: 'KVNsys POS & Inventory', exe: 'KVNsys POS & Inventory.exe', description: 'KVNsys POS & Inventory' },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Windows shortcuts are made through its scripting host. The paths go in as settings, never as code. */
function powershell(script, values) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...values },
    encoding: 'utf8',
  }).trim();
}

const desktop = powershell("[Environment]::GetFolderPath('Desktop')", {});

for (const app of apps) {
  const from = join(out, app.name);
  if (!existsSync(join(from, app.exe))) fail(`${from} has no ${app.exe}. Run \`pnpm package\` first.`);
  const to = join(programs, app.name);
  // It only ever replaces its own earlier copy.
  if (existsSync(to) && !existsSync(join(to, app.exe))) fail(`${to} exists, but isn't an earlier copy of ${app.name}. Leaving it alone.`);
  try {
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  } catch (error) {
    fail(`Couldn't replace ${to}. If ${app.name} is open, close it and run this again.\n(${error.message})`);
  }
  powershell(
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:KVNSYS_LINK); $s.TargetPath = $env:KVNSYS_TARGET; ' +
      '$s.WorkingDirectory = $env:KVNSYS_FOLDER; $s.Description = $env:KVNSYS_DESCRIPTION; $s.IconLocation = "$($env:KVNSYS_TARGET),0"; $s.Save()',
    {
      KVNSYS_LINK: join(desktop, `${app.name}.lnk`),
      KVNSYS_TARGET: join(to, app.exe),
      KVNSYS_FOLDER: to,
      KVNSYS_DESCRIPTION: app.description,
    },
  );
  console.log(`Installed ${app.name} in ${to}, with an icon on the desktop.`);
}

// The installed server can't see Phoenix's .env, so on this PC it gets its own settings file,
// pointing at the same database as `pnpm start:server`. An existing file is never touched.
const server = (path) => import(pathToFileURL(join(root, 'src', 'KVNsysServer', 'dist', path)).href);
const { defaultServerDataDir } = await server('setup/server-folder.js');
const { serverSettingsFile } = await server('setup/server-settings.js');
const settings = serverSettingsFile(defaultServerDataDir());
if (existsSync(settings)) {
  console.log(`The server's settings are in ${settings}. Left as they are.`);
} else {
  const envFile = join(root, '.env');
  // The lines are copied as they are, quoting and all, and never printed: they hold a password.
  const lines = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => /^\s*(export\s+)?(DATABASE_URL|KVNSYS_PORT)\s*=/.test(line))
    : [];
  if (!lines.some((line) => line.includes('DATABASE_URL'))) {
    console.log(`Before starting the server, put DATABASE_URL=... in ${settings}.`);
  } else {
    mkdirSync(dirname(settings), { recursive: true });
    writeFileSync(settings, ["# KVNsys Server's settings on this PC, written like a .env file: NAME=value.", ...lines, ''].join('\n'));
    console.log(`Pointed the installed server at the same database as \`pnpm start:server\`. Its settings are in ${settings}.`);
  }
}
