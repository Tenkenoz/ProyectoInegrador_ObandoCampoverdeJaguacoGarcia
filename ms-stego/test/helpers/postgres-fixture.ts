import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Module, type DynamicModule } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../src/database/database-options.js';

@Module({})
class FixtureDatabaseModule {}

export function fixtureDatabaseModule(database: DataSource): DynamicModule {
  return {
    module: FixtureDatabaseModule,
    global: true,
    providers: [{ provide: getDataSourceToken(), useValue: database }],
    exports: [getDataSourceToken()],
  };
}

export async function createPostgresFixture() {
  const name = `stego-integration-${randomUUID()}`;
  const password = randomUUID();
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_USER=stego',
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      'POSTGRES_DB=stego',
      'postgres:17-alpine',
    ],
    { stdio: 'pipe' },
  );
  let database: DataSource | undefined;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        execFileSync(
          'docker',
          ['exec', name, 'pg_isready', '-U', 'stego', '-d', 'stego'],
          { stdio: 'pipe' },
        );
        break;
      } catch {
        if (attempt === 99)
          throw new Error('The isolated test database did not become ready');
        await setTimeout(100);
      }
    }
    const inspection = JSON.parse(
      execFileSync('docker', ['inspect', name], { encoding: 'utf8' }),
    ) as {
      NetworkSettings: { Ports: Record<string, { HostPort: string }[]> };
    }[];
    const port = Number(
      inspection[0]!.NetworkSettings.Ports['5432/tcp']![0]!.HostPort,
    );
    database = new DataSource(
      databaseOptions({
        NODE_ENV: 'test',
        PORT: 3002,
        DB_HOST: '127.0.0.1',
        DB_PORT: port,
        DB_USERNAME: 'stego',
        DB_PASSWORD: password,
        DB_DATABASE: 'stego',
      }),
    );
    await database.initialize();
    await database.runMigrations();
    const connected = database;
    return {
      database: connected,
      dispose: async () => {
        if (connected.isInitialized) await connected.destroy();
        execFileSync('docker', ['stop', name], { stdio: 'pipe' });
      },
    };
  } catch (error) {
    if (database?.isInitialized) await database.destroy();
    execFileSync('docker', ['stop', name], { stdio: 'pipe' });
    throw error;
  }
}
