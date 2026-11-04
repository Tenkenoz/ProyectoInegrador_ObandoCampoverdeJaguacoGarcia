import dataSource from '/app/dist/database/data-source.js';

/*
 * One-shot STEGO migration runner.
 *
 * STEGO ships its migrations but its runtime image does not include the
 * TypeORM CLI, so the integration stack mounts this script into a throwaway
 * container and runs the migrations against stego-db.
 *
 * It only uses the compiled data source, therefore no STEGO source code is
 * modified.
 */

try {
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'each' });

  if (applied.length === 0) {
    console.log('[stego-migrate] no pending migrations');
  } else {
    for (const migration of applied) {
      console.log(`[stego-migrate] applied ${migration.name}`);
    }
  }
} finally {
  await dataSource.destroy();
}
