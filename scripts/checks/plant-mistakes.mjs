// `pnpm check:plants [list ...] [--dry-run]`: puts a known mistake into the code, one at a time, and
// checks the tests notice it. A mistake the tests miss means a test doesn't check what it claims to.
//
// Each list in scripts/checks/plants/ belongs to one step of work: for every mistake, the file, a piece
// of its text and what to put there instead, the packages to build, and the tests that should now
// fail. With no list named, every list runs. A list can be named by its file name alone.
//
// Every file is put back exactly as it was, after each mistake and when a run is stopped (Ctrl+C).
// Run it with nothing else building or testing: while a mistake is in, it's in what `pnpm build`
// makes too. The window tests open the app's window, again and again, for as long as it runs.
// --dry-run only checks that each mistake's text is still in its file, once, and that a test file
// answers to each of its tests' names; it changes nothing.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const listsFolder = join(root, 'scripts', 'checks', 'plants');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const named = args.filter((arg) => !arg.startsWith('--'));
const listFiles =
  named.length > 0
    ? named.map((name) => (/[\\/]/.test(name) ? resolve(name) : join(listsFolder, name.endsWith('.json') ? name : `${name}.json`)))
    : readdirSync(listsFolder)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => join(listsFolder, file));

// Pictures are for a person looking; a run of mistakes takes none.
const env = { ...process.env };
delete env.KVNSYS_SCREENSHOTS;

/** Runs a command, quietly, and says whether it went well. */
function run(command, cwd) {
  return new Promise((done) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'ignore', env });
    child.on('close', (code) => done(code === 0));
    child.on('error', () => done(false));
  });
}

async function build(packages) {
  for (const name of packages) if (!(await run(`pnpm --filter ${name} build`, root))) return false;
  return true;
}

/** The test files in a test project, wherever vitest would find them. */
function testFiles(project) {
  const found = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.test.ts')) found.push(path.replaceAll('\\', '/'));
    }
  };
  walk(join(root, 'tests', project));
  return found;
}

/**
 * Why a plant's tests can't be run, or null. A name no test file answers to (one renamed since the
 * list was written) makes vitest fail for finding nothing, which would read as the mistake noticed.
 */
function missingTests(tests) {
  for (const [project, filter] of tests) {
    if (!testFiles(project).some((path) => path.includes(filter))) return `no test file in ${project} answers to "${filter}"`;
  }
  return null;
}

/** True when at least one of the tests fails: the mistake was noticed. */
async function noticed(tests) {
  for (const [project, filter] of tests) if (!(await run(`pnpm exec vitest run ${filter}`, join(root, 'tests', project)))) return true;
  return false;
}

/** The file being changed, with what it said, so it can always be put back. */
let changed = null;
function putBack() {
  if (changed) writeFileSync(changed.path, changed.original);
  changed = null;
}
process.on('SIGINT', () => {
  putBack();
  console.log('\nStopped. The file a mistake was in is back as it was.');
  process.exit(130);
});

const results = { CAUGHT: 0, MISSED: 0, 'build failed': 0, SKIPPED: 0 };
const built = new Set();
const tested = new Map();

for (const listFile of listFiles) {
  const list = JSON.parse(readFileSync(listFile, 'utf8'));
  console.log(`\n${basename(listFile)}: ${list.step}`);
  for (const plant of list.plants) {
    const path = join(root, plant.file);
    const original = readFileSync(path, 'utf8');
    // The lists are written with \n; a file checked out with Windows line endings has \r\n.
    const ending = original.includes('\r\n') ? '\r\n' : '\n';
    const old = plant.old.replaceAll('\n', ending);
    const found = original.split(old).length - 1;
    if (found !== 1) {
      results.SKIPPED += 1;
      console.log(`  SKIPPED  ${plant.name}: its text is in ${plant.file} ${found} times, not once`);
      continue;
    }
    const cannotTest = missingTests(plant.tests);
    if (cannotTest) {
      results.SKIPPED += 1;
      console.log(`  SKIPPED  ${plant.name}: ${cannotTest}`);
      continue;
    }
    if (dryRun) {
      console.log(`  found    ${plant.name}`);
      continue;
    }
    for (const name of plant.build) built.add(name);
    for (const test of plant.tests) tested.set(test.join(' '), test);
    let result;
    try {
      changed = { path, original };
      // A function, so a "$" in the code never reads as a replacement pattern.
      writeFileSync(path, original.replace(old, () => plant.new.replaceAll('\n', ending)));
      result = !(await build(plant.build)) ? 'build failed' : (await noticed(plant.tests)) ? 'CAUGHT' : 'MISSED';
    } finally {
      putBack();
    }
    results[result] += 1;
    console.log(`  ${result.padEnd(8)} ${plant.name}`);
  }
}

if (!dryRun && built.size > 0) {
  // Everything back as it was: rebuilt, and every test that was run passes again.
  const restored = (await build([...built])) && !(await noticed([...tested.values()]));
  console.log(`\n${restored ? 'Every file is back, and all those tests pass again.' : 'FAILING after putting the files back: look before trusting anything above.'}`);
  if (!restored) process.exitCode = 1;
}
console.log(Object.entries(results).map(([kind, count]) => `${kind}: ${count}`).join(' · '));
if (results.MISSED > 0 || results.SKIPPED > 0) process.exitCode = 1;
