import dataSource from './data-source.js';

/**
 * Runs the AUTH migrations. Used by the one-shot "migrate" Compose service so
 * the production image does not need the TypeORM CLI or dev dependencies.
 */
async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    if (applied.length === 0) {
      console.log('[migrate] no pending migrations');
      return;
    }

    for (const migration of applied) {
      console.log(`[migrate] applied ${migration.name}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[migrate] failed', error);
  process.exitCode = 1;
});
