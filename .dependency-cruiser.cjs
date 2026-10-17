// The structure rules from docs/design.md §6, enforced. `pnpm check:structure`
// fails the build when one is broken, so they cannot quietly erode.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'domain/ holds the rules. It imports no framework, no database and no other layer, ' +
        'so the rules can be read and tested on their own.',
      severity: 'error',
      from: { path: '^modules/src/[^/]+/domain/' },
      to: {
        path: [
          '(^|/)node_modules/(@nestjs|@prisma|express|cookie-parser)/',
          '^database/',
          '^modules/src/[^/]+/(application|infrastructure|http)/',
        ],
      },
    },
    {
      name: 'database-only-in-infrastructure',
      comment:
        'Only infrastructure/ talks to the database. Everything else goes through the ' +
        'repository classes application/ declares.',
      severity: 'error',
      from: {
        path: '^modules/src/',
        pathNot: '^modules/src/[^/]+/infrastructure/',
      },
      to: { path: ['^database/', '(^|/)node_modules/@prisma/'] },
    },
    {
      name: 'application-knows-no-delivery',
      comment: 'application/ is the operations. It does not know about HTTP or the database.',
      severity: 'error',
      from: { path: '^modules/src/[^/]+/application/' },
      to: { path: '^modules/src/[^/]+/(infrastructure|http)/' },
    },
    {
      name: 'web-apps-only-reach-the-api',
      comment:
        'A screen talks to the system only through @phoenix/api-client. It never imports ' +
        'a module, the database or the server framework.',
      severity: 'error',
      from: { path: '^apps/(pos-web|admin-web)/' },
      to: {
        path: [
          '^modules/',
          '^database/',
          '(^|/)node_modules/(@nestjs|@prisma)/',
          // By name too: a web app doesn't list these packages, so the import can't even
          // resolve, and an unresolved import has only its name to match on.
          '^@phoenix/(modules|database)$',
          '^@(nestjs|prisma)/',
        ],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Packages and built output are kept as the *end* of an import, so the rules above can
    // see "this file imports @nestjs" or "this file imports the database", but they aren't
    // crawled into. Excluding them instead would delete those imports, and with them every
    // rule about packages. That happened once: three rules passed while being unable to fire.
    doNotFollow: { path: ['(^|/)node_modules/', '(^|/)dist/'] },
    exclude: { path: '(^|/)generated/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.d.ts'],
    },
  },
};
