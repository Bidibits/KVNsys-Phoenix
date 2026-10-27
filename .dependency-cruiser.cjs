// The guard: the README's "Who may use whom" rules, checked on every `pnpm build`.
// Each rule below is one row of that table or one of its bullets. Change the README and
// this file together. After changing a rule, plant a mistake that breaks it and make sure
// the guard catches it: a rule that can't fail isn't a rule.

/**
 * One row of the table. A project may import only itself and the projects named, and
 * that's checked twice: by where an import lands on disk, and by package name, because
 * a package a project doesn't list can't be found and only its name is left to check.
 */
function mayUse(project, packageName, allowed) {
  const folders = [project, ...allowed.map(([folder]) => folder)].join('|');
  const names = [packageName, ...allowed.map(([, name]) => name)].join('|');
  return {
    from: { path: `^src/KVNsys${project}/` },
    to: { path: [`^src/KVNsys(?!(${folders})/)[^/]+/`, `^@kvnsys/(?!(${names})$)`] },
  };
}

const Core = ['Core', 'core'];
const Wire = ['Wire', 'wire'];
const Postgres = ['Postgres', 'postgres'];
const Server = ['Server', 'server'];
const Client = ['Client', 'client'];
const UI = ['UI', 'ui'];

// Packages that mean "a framework, a database, or screens". Matched by where they land
// in node_modules, and by name for when they aren't installed in that project.
const frameworks = {
  path: '(^|/)node_modules/(@nestjs/[^/]+|express|@prisma/[^/]+|prisma|pg|postgres|react|react-dom|electron|vite)/',
  name: '^(@nestjs/|express(/|$)|@prisma/|prisma(/|$)|pg(/|$)|postgres(/|$)|react(-dom)?(/|$)|electron(/|$)|vite(/|$))',
};
const database = {
  path: '(^|/)node_modules/(@prisma/[^/]+|prisma|pg|postgres)/',
  name: '^(@prisma/|prisma(/|$)|pg(/|$)|postgres(/|$))',
};
const screens = {
  path: '(^|/)node_modules/(react|react-dom|electron)/',
  name: '^(react|react-dom|electron)(/|$)',
};

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── The table ────────────────────────────────────────────────────────────────
    {
      name: 'core-uses-nothing',
      comment: 'KVNsysCore uses nothing else: no other project, no framework, no database, no screens.',
      severity: 'error',
      from: { path: '^src/KVNsysCore/' },
      to: { path: ['^src/KVNsys(?!Core/)[^/]+/', '^@kvnsys/(?!core$)', frameworks.path, frameworks.name] },
    },
    {
      name: 'wire-may-use-only-core',
      comment: 'KVNsysWire may use KVNsysCore.',
      severity: 'error',
      ...mayUse('Wire', 'wire', [Core]),
    },
    {
      name: 'postgres-may-use-only-core',
      comment: 'KVNsysPostgres may use KVNsysCore.',
      severity: 'error',
      ...mayUse('Postgres', 'postgres', [Core]),
    },
    {
      name: 'server-may-use-core-wire-postgres',
      comment: 'KVNsysServer may use KVNsysCore, KVNsysWire and KVNsysPostgres.',
      severity: 'error',
      ...mayUse('Server', 'server', [Core, Wire, Postgres]),
    },
    {
      name: 'server-app-may-use-server-ui',
      comment: 'KVNsysServerApp may use KVNsysServer and KVNsysUI.',
      severity: 'error',
      ...mayUse('ServerApp', 'server-app', [Server, UI]),
    },
    {
      name: 'client-may-use-core-wire',
      comment: 'KVNsysClient may use KVNsysCore and KVNsysWire.',
      severity: 'error',
      ...mayUse('Client', 'client', [Core, Wire]),
    },
    {
      name: 'ui-may-use-only-core',
      comment: 'KVNsysUI may use KVNsysCore.',
      severity: 'error',
      ...mayUse('UI', 'ui', [Core]),
    },
    {
      name: 'client-app-may-use-client-ui',
      comment: 'KVNsysClientApp may use KVNsysClient and KVNsysUI.',
      severity: 'error',
      ...mayUse('ClientApp', 'client-app', [Client, UI]),
    },

    // ── The bullets ──────────────────────────────────────────────────────────────
    {
      name: 'only-postgres-has-sql',
      comment: 'Only KVNsysPostgres talks to the database.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/KVNsysPostgres/' },
      to: { path: [database.path, database.name] },
    },
    {
      name: 'screens-only-in-ui-and-apps',
      comment: 'Engines hold no screens: only KVNsysUI and the two apps may use React or Electron.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/KVNsys(UI|ClientApp|ServerApp)/' },
      to: { path: [screens.path, screens.name] },
    },

    // ── Housekeeping ─────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: 'Two files that import each other can never be understood one at a time.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'imports-must-resolve',
      comment:
        'Every import must point at something that exists, in a package the project lists. ' +
        'An import that resolves to nothing is a typo, or a dependency missing from package.json.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],

  options: {
    // Packages, built output and Prisma's generated client are kept as the *end* of an
    // import but not crawled into. They are deliberately NOT excluded: excluding them would
    // delete every import that reaches them, and with it every rule about packages. That
    // happened in an earlier version of Phoenix, where three rules passed while unable to fire.
    doNotFollow: { path: ['(^|/)node_modules/', '(^|/)dist/', '(^|/)generated/'] },
    // pnpm's per-project links. Imports through them resolve to node_modules/.pnpm, which
    // isn't excluded, so this only stops the scan from wandering into installed packages.
    exclude: { path: '^src/[^/]+/node_modules/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      // "source" points a workspace package at its TypeScript, so the guard works before
      // anything has been built.
      conditionNames: ['source', 'import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.d.ts'],
    },
  },
};
