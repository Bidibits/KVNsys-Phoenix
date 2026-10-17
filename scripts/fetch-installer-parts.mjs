// `pnpm fetch:installer-parts`: downloads what the server's setup file will carry, into vendor/
// (never committed):
//   - PostgreSQL's Windows programs, from EDB, unpacked
//   - Microsoft's Visual C++ runtime. PostgreSQL's programs need it, and a fresh Windows may not have it.
//
// Each file is checked against the fingerprint (SHA-256) recorded here when it was first fetched,
// so a file that has changed at its source is refused rather than shipped.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const vendor = join(fileURLToPath(new URL('..', import.meta.url)), 'vendor');

const parts = [
  {
    name: 'PostgreSQL 18.6 for Windows (EDB)',
    url: 'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip',
    file: join(vendor, 'postgresql', 'postgresql-18.6-1-windows-x64-binaries.zip'),
    sha256: 'fbe23da234ee31547bf8a36d29dfd81e82b849df2d2b78d2eecb43d360252f8c',
    unpacked: join(vendor, 'postgresql', 'pgsql', 'bin', 'postgres.exe'),
  },
  {
    name: "Microsoft's Visual C++ runtime 14.44",
    // Microsoft's own link, which names the file's fingerprint in its path.
    url: 'https://download.visualstudio.microsoft.com/download/pr/990c720a-46ce-4dc7-87b9-c2eb615d34b9/CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B/VC_redist.x64.exe',
    file: join(vendor, 'vc-redist', 'VC_redist.x64.exe'),
    sha256: 'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b',
  },
];

async function sha256Of(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

for (const part of parts) {
  if (existsSync(part.file) && (await sha256Of(part.file)) === part.sha256) {
    console.log(`${part.name}: already here, fingerprint checked.`);
  } else {
    console.log(`${part.name}: downloading from ${new URL(part.url).host}...`);
    mkdirSync(dirname(part.file), { recursive: true });
    const partial = `${part.file}.part`;
    const response = await fetch(part.url);
    if (!response.ok || !response.body) throw new Error(`${part.url} answered ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    const got = await sha256Of(partial);
    if (got !== part.sha256) {
      rmSync(partial, { force: true });
      throw new Error(`${part.name} isn't the file this was set up for (fingerprint ${got}). Refusing it.`);
    }
    renameSync(partial, part.file);
    console.log(`${part.name}: downloaded, fingerprint checked.`);
  }
  if (part.unpacked && !existsSync(part.unpacked)) {
    // Windows' own tar unpacks zips.
    execFileSync('tar', ['-xf', part.file, '-C', dirname(part.file)], { stdio: 'inherit' });
    console.log(`${part.name}: unpacked.`);
  }
}
