// `pnpm package`: makes the two programs a shop's PCs run, from what `pnpm build` produced.
//
//   out/KVNsys POS & Inventory/            the app for each register: Electron, with its own Chrome and Node
//   out/KVNsys POS & Inventory Setup.exe   that app as one setup file, to carry to a register
//   out/KVNsys Server/                     the server: KVNsys Server.exe, a console program, with its own Node
//   out/KVNsys Server Setup.exe            the server PC's setup file: that server, plus its own PostgreSQL
//
// None of them needs Node or pnpm on the PC it runs on. `pnpm install:here` installs the app and the
// server on this PC.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import electronBuilder from 'electron-builder';
import { build } from 'esbuild';
import postject from 'postject';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'out');
const stage = join(out, 'stage');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/** The register app. Its desktop side is bundled into one file, so the package needs no node_modules. */
async function packageClient() {
  const app = join(root, 'src', 'KVNsysClientApp');
  const { productName, version } = readJson(join(app, 'package.json'));
  const electronVersion = readJson(join(app, 'node_modules', 'electron', 'package.json')).version;
  const dir = join(stage, 'client');
  rmSync(dir, { recursive: true, force: true });

  await build({
    entryPoints: [join(app, 'dist', 'desktop', 'main.js')],
    outfile: join(dir, 'dist', 'desktop', 'main.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    // Real class and function names, in NestJS's log and in stack traces.
    keepNames: true,
    external: ['electron'],
    // Anything bundled that still calls require() gets a real one.
    banner: { js: "import { createRequire as kvnsysCreateRequire } from 'node:module'; const require = kvnsysCreateRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  // The preload only uses Electron, and the screens are already bundled by Vite.
  copyFileSync(join(app, 'dist', 'desktop', 'preload.cjs'), join(dir, 'dist', 'desktop', 'preload.cjs'));
  cpSync(join(app, 'dist', 'screens'), join(dir, 'dist', 'screens'), { recursive: true });
  writeJson(join(dir, 'package.json'), {
    name: 'kvnsys-pos-inventory',
    // Also names the app's settings folder in %APPDATA%, so it must stay the same.
    productName,
    version,
    description: 'KVNsys POS & Inventory, the app for each register',
    author: 'KVNsys',
    private: true,
    type: 'module',
    main: 'dist/desktop/main.js',
  });

  const [packaged] = await packager({
    dir,
    out: join(stage, 'client-packaged'),
    overwrite: true,
    name: productName,
    executableName: productName,
    platform: 'win32',
    arch: 'x64',
    electronVersion,
    appVersion: version,
    asar: true,
    prune: false,
    win32metadata: { CompanyName: 'KVNsys', ProductName: productName, FileDescription: productName },
  });
  const target = join(out, productName);
  rmSync(target, { recursive: true, force: true });
  renameSync(packaged, target);
  return target;
}

/**
 * The register's setup file, made from the app packageClient made. Double-clicked, it installs the
 * app for the person signed in to Windows, with no administrator rights and no questions. It adds
 * a desktop icon, a Start menu icon, and an uninstaller in Windows' list of apps.
 */
async function makeClientSetup(packagedApp) {
  const app = join(root, 'src', 'KVNsysClientApp');
  const { productName } = readJson(join(app, 'package.json'));
  const electronVersion = readJson(join(app, 'node_modules', 'electron', 'package.json')).version;
  const output = join(stage, 'setup');
  rmSync(output, { recursive: true, force: true });

  const { build: buildSetup, Platform, Arch } = electronBuilder;
  await buildSetup({
    targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
    prepackaged: packagedApp,
    projectDir: join(stage, 'client'),
    config: {
      // Windows knows the installed app by this. Changing it would install a second copy beside the first.
      appId: 'com.kvnsys.pos-inventory',
      productName,
      electronVersion,
      npmRebuild: false,
      publish: null,
      directories: { output },
      nsis: {
        oneClick: true,
        perMachine: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        // The register's settings (its server, and the server it trusts) survive an uninstall and reinstall.
        deleteAppDataOnUninstall: false,
        artifactName: '${productName} Setup.${ext}',
      },
    },
  });
  const setup = join(out, `${productName} Setup.exe`);
  copyFileSync(join(output, `${productName} Setup.exe`), setup);
  return setup;
}

/**
 * The server, as one exe: Node's "single executable application". It runs a single CommonJS file
 * and loads nothing else from disk except Node's own modules, so everything goes into that file.
 */
async function packageServer() {
  const server = join(root, 'src', 'KVNsysServer');
  const { version } = readJson(join(server, 'package.json'));
  const dir = join(stage, 'server');
  const target = join(out, 'KVNsys Server');
  rmSync(dir, { recursive: true, force: true });
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, 'app'), { recursive: true });

  await build({
    entryPoints: [join(server, 'dist', 'start.js')],
    outfile: join(dir, 'server.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    // Real class and function names, in NestJS's log and in stack traces.
    keepNames: true,
    // Optional parts of NestJS and pg that KVNsys doesn't use. They're only loaded if present,
    // inside a try, so leaving them out is safe.
    external: [
      '@nestjs/microservices',
      '@nestjs/microservices/*',
      '@nestjs/websockets',
      '@nestjs/websockets/*',
      'class-transformer',
      'class-transformer/*',
      'class-validator',
      'pg-native',
    ],
    // Two files are read from beside the code: the server's package.json (for its version) and
    // the database updates it ships with. In the exe's folder they sit under app/, so the code is
    // told it lives at app/dist/server.cjs and finds them where it always looks.
    define: { 'import.meta.url': 'kvnsysModuleUrl' },
    banner: {
      js: "const kvnsysModuleUrl = require('node:url').pathToFileURL(require('node:path').join(require('node:path').dirname(process.execPath), 'app', 'dist', 'server.cjs')).href;",
    },
    logLevel: 'warning',
  });
  writeJson(join(target, 'app', 'package.json'), { name: 'kvnsys-server', version, private: true });
  cpSync(join(root, 'src', 'KVNsysPostgres', 'prisma', 'migrations'), join(target, 'app', 'prisma', 'migrations'), { recursive: true });
  const migrations = readdirSync(join(target, 'app', 'prisma', 'migrations'), { withFileTypes: true }).filter((e) => e.isDirectory());
  if (migrations.length === 0) throw new Error('No database updates were copied next to the server; it would refuse every database.');

  writeJson(join(dir, 'sea-config.json'), {
    main: join(dir, 'server.cjs'),
    output: join(dir, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  });
  execFileSync(process.execPath, ['--experimental-sea-config', join(dir, 'sea-config.json')], { stdio: 'inherit' });

  // This PC's own Node, with the server put inside it.
  const exe = join(target, 'KVNsys Server.exe');
  copyFileSync(process.execPath, exe);
  await postject.inject(exe, 'NODE_SEA_BLOB', readFileSync(join(dir, 'sea-prep.blob')), {
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  });
  return target;
}

/**
 * The server PC's setup file, built by Inno Setup from scripts/server-setup/kvnsys-server.iss. It
 * carries the server packageServer made, PostgreSQL and the Visual C++ runtime from vendor/, and
 * the scripts that install PostgreSQL as a service and remove it again.
 */
function makeServerSetup() {
  const candidates = [
    process.env.ISCC,
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 7', 'ISCC.exe'),
    join(process.env.ProgramFiles ?? '', 'Inno Setup 7', 'ISCC.exe'),
  ];
  const iscc = candidates.find((path) => path && existsSync(path));
  if (!iscc) {
    console.log("Skipped KVNsys Server Setup.exe: Inno Setup 7 isn't installed on this PC (see the README).");
    return null;
  }
  for (const needed of [join('vendor', 'postgresql', 'pgsql', 'bin', 'postgres.exe'), join('vendor', 'vc-redist', 'VC_redist.x64.exe')]) {
    if (!existsSync(join(root, needed))) throw new Error(`${needed} is missing. Run \`pnpm fetch:installer-parts\` first.`);
  }
  const { version } = readJson(join(root, 'src', 'KVNsysServer', 'package.json'));
  // No path here ends in a backslash: before a closing quote, Windows reads that as an escaped quote.
  execFileSync(iscc, ['/Qp', `/DAppVersion=${version}`, `/O${out}`, join(root, 'scripts', 'server-setup', 'kvnsys-server.iss')], {
    stdio: 'inherit',
  });
  return join(out, 'KVNsys Server Setup.exe');
}

const client = await packageClient();
const made = [client, await makeClientSetup(client), await packageServer(), makeServerSetup()].filter(Boolean);
for (const path of made) {
  if (!existsSync(path)) throw new Error(`Packaging finished but ${path} isn't there.`);
  console.log(`Made ${path}`);
}
console.log('Run `pnpm install:here` to install the app and the server on this PC, with icons on the desktop.');
console.log('A register gets the app from the setup file instead.');
