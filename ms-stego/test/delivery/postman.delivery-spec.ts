import newman, { type NewmanRunSummary } from 'newman';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { Analysis } from '../../src/database/entities/analysis.entity.js';
import { QuarantineMaintenanceService } from '../../src/storage/quarantine-maintenance.service.js';
import { createDeliveryFixture } from '../helpers/delivery-fixture.js';

describe('Exported Spanish Postman collection against isolated STEGO', () => {
  let fixture: Awaited<ReturnType<typeof createDeliveryFixture>>;
  let variables: Record<string, string>;
  const secondId = randomUUID();
  const adminId = randomUUID();
  const userId = randomUUID();
  const results: {
    group: string;
    requests: number;
    assertions: number;
    failed: number;
  }[] = [];

  beforeAll(async () => {
    fixture = await createDeliveryFixture();
    await fixture.app.listen(0, '127.0.0.1');
    const address = fixture.app.getHttpServer().address() as AddressInfo;
    const primary = await fixture.auth.signing.issue();
    variables = {
      stego_origin: `http://127.0.0.1:${address.port}`,
      access_token: primary,
      expired_token: await fixture.auth.signing.issue({
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
      second_analyst_token: await fixture.auth.signing.issue({ sub: secondId }),
      admin_token: await fixture.auth.signing.issue({ sub: adminId }),
      user_token: await fixture.auth.signing.issue({ sub: userId }),
      revocation_token: primary,
    };
  });
  afterAll(async () => {
    await fixture?.dispose();
  });

  it('keeps credentials empty and saved examples tied to actual local evidence', async () => {
    const collection = JSON.parse(
      await readFile('postman/stego.postman_collection.json', 'utf8'),
    );
    const source = JSON.parse(
      await readFile('postman/examples-source.json', 'utf8'),
    );
    expect(collection.item).toHaveLength(9);
    let examples = 0;
    for (const folder of collection.item) {
      for (const item of folder.item) {
        for (const response of item.response ?? []) {
          examples++;
          expect(response.name).toContain('AUTH de pruebas');
          const matching = source.casos.find(
            (entry: { actual_http_status: number; response: unknown }) =>
              entry.actual_http_status === response.code &&
              JSON.stringify(entry.response) ===
                JSON.stringify(JSON.parse(response.body)),
          );
          expect(matching).toBeDefined();
          if (item.name.startsWith('T10'))
            expect(response.code).toBeGreaterThanOrEqual(400);
        }
      }
    }
    expect(examples).toBe(9);
    for (const file of ['local', 'integrated']) {
      const environment = JSON.parse(
        await readFile(`postman/${file}.postman_environment.json`, 'utf8'),
      );
      const secrets = environment.values.filter((entry: { key: string }) =>
        entry.key.endsWith('_token'),
      );
      expect(secrets).toHaveLength(6);
      for (const entry of secrets) {
        expect(entry.value).toBe('');
        expect(entry.type).toBe('secret');
      }
      expect(
        environment.values.find(
          (entry: { key: string }) => entry.key === 'run_manual_cases',
        ).value,
      ).toBe('false');
    }
    expect(JSON.stringify(collection)).not.toMatch(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    );
    expect(JSON.stringify(collection)).not.toContain('BEGIN PRIVATE KEY');
  });

  async function run(
    group: string,
    folder?: string[],
    overrides: Record<string, string> = {},
  ) {
    const environment = JSON.parse(
      await readFile('postman/local.postman_environment.json', 'utf8'),
    );
    for (const [key, value] of Object.entries({ ...variables, ...overrides })) {
      const existing = environment.values.find(
        (entry: { key: string }) => entry.key === key,
      );
      if (existing) existing.value = value;
      else environment.values.push({ key, value, enabled: true });
    }
    const summary = await new Promise<NewmanRunSummary>((resolve, reject) => {
      newman
        .run(
          {
            collection: 'postman/stego.postman_collection.json',
            environment,
            folder,
            workingDir: process.cwd(),
            insecureFileRead: false,
            timeoutRequest: 5000,
            timeoutScript: 5000,
          },
          (error, value) => (error ? reject(error) : resolve(value)),
        )
        .on('beforeRequest', (_error, args) => {
          const name = args.item.name as string;
          fixture.auth.state.mode = 'allow';
          fixture.auth.state.scope = 'own';
          fixture.auth.state.subjectId = null;
          if (name.includes('otro ANALYST'))
            fixture.auth.state.subjectId = secondId;
          if (name.includes('al ADMIN')) {
            fixture.auth.state.subjectId = adminId;
            fixture.auth.state.scope = 'any';
          }
          if (name.includes('al rol USER')) {
            fixture.auth.state.subjectId = userId;
            fixture.auth.state.mode = 'deny';
          }
          if (name.includes('después de retirar'))
            fixture.auth.state.mode = 'deny';
          if (name.includes('AUTH está inaccesible'))
            fixture.auth.state.mode = 'unavailable';
        });
    });
    expect(
      summary.run.failures.map((entry) => ({
        request: entry.source?.name,
        error: entry.error.name,
        test: entry.error.test,
      })),
    ).toEqual([]);
    results.push({
      group,
      requests: summary.run.stats.requests.total ?? 0,
      assertions: summary.run.stats.assertions.total ?? 0,
      failed: summary.run.stats.assertions.failed ?? 0,
    });
    return summary;
  }

  it('runs all 38 requests, including controlled role changes and expiry, with Newman', async () => {
    const standard = await run(
      'Casos automáticos; condiciones manuales omitidas',
    );
    expect(standard.run.stats.requests.total).toBe(30);
    const roles = await run(
      'Roles, propiedad y revocación simulados',
      [
        '05 · T04 y T11 — Roles y propiedad reales',
        '06 · T07 — Revocación con el mismo JWT',
      ],
      { run_manual_cases: 'true', role_revoked_confirmed: 'true' },
    );
    expect(roles.run.stats.requests.total).toBe(6);
    const retained = await fixture.database
      .getRepository(Analysis)
      .findOneByOrFail({
        userId: fixture.auth.signing.userId,
        quarantineState: 'stored',
      });
    await fixture.database.getRepository(Analysis).update(retained.id, {
      quarantineExpiresAt: new Date(Date.now() - 1000),
    });
    await fixture.app.get(QuarantineMaintenanceService).sweep();
    const dependencies = await run(
      'Indisponibilidad simulada y limpieza real',
      ['07 · Dependencias y retención'],
      {
        run_manual_cases: 'true',
        auth_unavailable_confirmed: 'true',
        retention_cleanup_confirmed: 'true',
        retained_analysis_id: retained.id,
      },
    );
    expect(dependencies.run.stats.requests.total).toBe(2);
    await writeFile(
      'postman/verification.json',
      `${JSON.stringify(
        {
          tipo: 'verificacion_local_con_newman',
          sha256_coleccion: createHash('sha256')
            .update(await readFile('postman/stego.postman_collection.json'))
            .digest('hex'),
          generado_en: new Date().toISOString(),
          alcance:
            'Colección exportada ejecutada contra STEGO real con PostgreSQL aislado y AUTH HTTPS de pruebas. No acredita roles reales ni capturas finales de Postman.',
          grupos: results,
          solicitudes_verificadas: results.reduce(
            (total, item) => total + item.requests,
            0,
          ),
          aserciones_aprobadas: results.reduce(
            (total, item) => total + item.assertions,
            0,
          ),
          fallos: 0,
        },
        null,
        2,
      )}\n`,
    );
  }, 60000);
});
