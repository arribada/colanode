// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Kysely's FileMigrationProvider loads migration files via a runtime dynamic
// `import()`. It is a Node-only code path that the mobile client never uses
// (migrations are supplied inline via `new Migrator({ provider: { getMigrations } })`),
// but it still gets pulled into the bundle through `kysely`'s barrel export and
// Hermes cannot compile the dynamic `import()` ("Invalid expression"). Resolve
// that module to an empty stub for React Native so the bundle stays Hermes-safe.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.includes('file-migration-provider')) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
