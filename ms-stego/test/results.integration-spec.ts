import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID, createHash } from 'node:crypto';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  unlink,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { AUTH_CONFIG } from '../src/auth/config/auth.config.js';
import { Analysis } from '../src/database/entities/analysis.entity.js';
import { AuditEvent } from '../src/database/entities/audit-event.entity.js';
import { AnalysisRepository } from '../src/persistence/analysis.repository.js';
import { setupApp } from '../src/setup-app.js';
import { IMAGE_WORKER_URL } from '../src/steganography/config/upload.config.js';
import {
  POLICY_CONFIG,
  validatePolicyConfiguration,
} from '../src/steganography/policy/config/policy.config.js';
import { SteganographyModule } from '../src/steganography/steganography.module.js';
import {
  STORAGE_CONFIG,
  validateStorageConfiguration,
} from '../src/storage/config/storage.config.js';
import { QuarantineMaintenanceService } from '../src/storage/quarantine-maintenance.service.js';
import { QuarantineScheduler } from '../src/storage/quarantine-scheduler.js';
import { QuarantineService } from '../src/storage/quarantine.service.js';
import { createSampleSuite } from '../src/tools/samples/sample-suite.js';
import { createAuthFixture } from './helpers/auth-fixture.js';
import {
  createPostgresFixture,
  fixtureDatabaseModule,
} from './helpers/postgres-fixture.js';

const endpoint = '/api/v1/steganography';

describe('Durable results, private retention and audit', () => {
  let database: Awaited<ReturnType<typeof createPostgresFixture>>;
  let auth: Awaited<ReturnType<typeof createAuthFixture>>;
  let suite: ReturnType<typeof createSampleSuite>;
  let app: INestApplication;
  let directory: string;
  let token: string;
  let repository: AnalysisRepository;
  let maintenance: QuarantineMaintenanceService;
  let policies: ReturnType<typeof validatePolicyConfiguration>;
  let storage: ReturnType<typeof validateStorageConfiguration>;
  let logs: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    database = await createPostgresFixture();
    auth = await createAuthFixture();
    suite = createSampleSuite();
  });
  beforeEach(async () => {
    auth.state.mode = 'allow';
    auth.state.scope = 'own';
    token = await auth.signing.issue();
    directory = await mkdtemp(join(tmpdir(), 'stego-persisted-'));
    policies = validatePolicyConfiguration({});
    storage = validateStorageConfiguration({
      QUARANTINE_DIR: directory,
      QUARANTINE_RETENTION_SECONDS: 60,
      QUARANTINE_ORPHAN_GRACE_SECONDS: 60,
    });
    logs = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const module = await Test.createTestingModule({
      imports: [
        fixtureDatabaseModule(database.database),
        AuthModule,
        SteganographyModule,
      ],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(auth.config)
      .overrideProvider(STORAGE_CONFIG)
      .useValue(storage)
      .overrideProvider(POLICY_CONFIG)
      .useValue(policies)
      .overrideProvider(QuarantineScheduler)
      .useValue({})
      .overrideProvider(IMAGE_WORKER_URL)
      .useValue(
        new URL(
          '../dist/steganography/workers/image-decoder.worker.js',
          import.meta.url,
        ),
      )
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    repository = module.get(AnalysisRepository);
    maintenance = module.get(QuarantineMaintenanceService);
  });
  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
    await database.database.query('TRUNCATE analyses, audit_events');
  });
  afterAll(async () => {
    await auth?.dispose();
    await database?.dispose();
  });

  async function analyze(filename = 'lsb-payload.png') {
    return request(app.getHttpServer())
      .post(`${endpoint}/analyze`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', suite.files.get(filename)!, {
        filename,
        contentType: filename.endsWith('.bmp') ? 'image/bmp' : 'image/png',
      });
  }
  async function read(id: string) {
    return request(app.getHttpServer())
      .get(`${endpoint}/results/${id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('persists complete evidence and returns the same record on a later request', async () => {
    const posted = await analyze();
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({
      status: 'sospechoso',
      action: 'cuarentena',
      legacy: false,
      quarantine: { state: 'stored' },
    });
    const id = posted.body.analysis_id;
    expect(posted.body.upload_id).toBe(id);
    expect((await read(id)).body).toEqual(posted.body);
    const row = await repository.findById(id);
    expect(row?.metadata?.detector_parameters.LSB_MIN_PIXELS).toBe(4096);
    const bytes = await readFile(join(directory, `${id}.bin`));
    expect(bytes).toEqual(suite.files.get('lsb-payload.png'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row?.sha256);
    const events = await database.database
      .getRepository(AuditEvent)
      .findBy({ resourceId: id });
    expect(events.map((event) => event.event)).toEqual(
      expect.arrayContaining([
        'analysis.completed',
        'policy.applied',
        'quarantine.stored',
        'analysis.read',
      ]),
    );
    expect(JSON.stringify(posted.body)).not.toContain(directory);
    expect(JSON.stringify(posted.body)).not.toContain('quarantine_key');
  });

  it('enforces ownership and lets an AUTH-granted ADMIN scope read other owners', async () => {
    const posted = await analyze('original.png');
    const id = posted.body.analysis_id;
    await database.database
      .getRepository(Analysis)
      .update(id, { userId: randomUUID() });
    expect((await read(id)).status).toBe(403);
    auth.state.scope = 'any';
    expect((await read(id)).status).toBe(200);
    auth.state.mode = 'deny';
    expect((await read(id)).status).toBe(403);
  });

  it('distinguishes invalid identifiers and authorized missing records', async () => {
    expect((await read('invalid')).status).toBe(400);
    expect((await read(randomUUID())).status).toBe(404);
    await request(app.getHttpServer())
      .get(`${endpoint}/results/${randomUUID()}`)
      .expect(401);
  });

  it.each(['advertencia', 'rechazo'] as const)(
    'persists policy %s while discarding the original image',
    async (action) => {
      policies.POLICY_SUSPICIOUS_ACTION = action;
      const posted = await analyze();
      expect(posted.status).toBe(200);
      expect(posted.body).toMatchObject({
        action,
        quarantine: { state: 'none', expires_at: null },
      });
      expect(await readdir(directory)).toEqual([]);
      expect(await database.database.getRepository(Analysis).count()).toBe(1);
    },
  );

  it('retains inconclusive results without storing files under the default warning policy', async () => {
    const posted = await analyze('small.png');
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({
      status: 'no_concluyente',
      action: 'advertencia',
      indicators: { p_value: null },
    });
    expect(await readdir(directory)).toEqual([]);
  });

  it('expires retained bytes while preserving the analysis and its historical policy', async () => {
    const posted = await analyze();
    const id = posted.body.analysis_id;
    const report = await maintenance.sweep(new Date(Date.now() + 61000));
    expect(report.deleted).toBe(1);
    expect(await readdir(directory)).toEqual([]);
    const result = await read(id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      action: 'cuarentena',
      quarantine: { state: 'deleted' },
    });
    expect(result.body.quarantine.deleted_at).not.toBeNull();
  });

  it('records missing files and removes confirmed orphan files after the grace period', async () => {
    const posted = await analyze();
    const id = posted.body.analysis_id;
    await unlink(join(directory, `${id}.bin`));
    expect((await maintenance.sweep()).missing).toBe(1);
    expect((await read(id)).body.quarantine.state).toBe('missing');
    const key = randomUUID();
    await app.get(QuarantineService).store(key, Buffer.from('orphan'));
    const old = new Date(Date.now() - 120000);
    await utimes(join(directory, `${key}.bin`), old, old);
    expect((await maintenance.sweep()).orphans).toBe(1);
    expect(await readdir(directory)).toEqual([]);
  });

  it('fails closed on capacity exhaustion without creating a false retained record', async () => {
    storage.QUARANTINE_MAX_FILES = 1;
    expect((await analyze()).status).toBe(200);
    expect((await analyze()).status).toBe(503);
    expect(await database.database.getRepository(Analysis).count()).toBe(1);
    expect((await readdir(directory)).length).toBe(1);
  });

  it('compensates file writes when the database rolls back the critical audit event', async () => {
    await database.database.query(
      `CREATE FUNCTION reject_analysis_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = 'analysis.completed' THEN RAISE EXCEPTION 'private-database-message'; END IF; RETURN NEW; END $$`,
    );
    await database.database.query(
      'CREATE TRIGGER reject_analysis_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_analysis_audit()',
    );
    try {
      const response = await analyze();
      expect(response.status).toBe(503);
      expect(await database.database.getRepository(Analysis).count()).toBe(0);
      expect(await readdir(directory)).toEqual([]);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(
        'private-database-message',
      );
    } finally {
      await database.database.query(
        'DROP TRIGGER reject_analysis_audit ON audit_events',
      );
      await database.database.query('DROP FUNCTION reject_analysis_audit()');
    }
  });

  it('recovers a committed transaction after a lost acknowledgement', async () => {
    const create = repository.create.bind(repository);
    vi.spyOn(repository, 'create').mockImplementationOnce(
      async (draft, requestId, prepare) => {
        await create(draft, requestId, prepare);
        throw new Error('lost acknowledgement');
      },
    );
    const response = await analyze();
    expect(response.status).toBe(200);
    expect(await database.database.getRepository(Analysis).count()).toBe(1);
    expect((await readdir(directory)).length).toBe(1);
  });

  it('keeps ambiguous files private until the database can confirm orphan status', async () => {
    vi.spyOn(repository, 'create').mockImplementationOnce(
      async (_draft, _requestId, prepare) => {
        await prepare?.();
        throw new Error('unavailable');
      },
    );
    const lookup = vi
      .spyOn(repository, 'findById')
      .mockRejectedValue(new Error('unavailable'));
    expect((await analyze()).status).toBe(503);
    const files = await readdir(directory);
    expect(files.length).toBe(1);
    lookup.mockRestore();
    const old = new Date(Date.now() - 120000);
    await utimes(join(directory, files[0]!), old, old);
    expect((await maintenance.sweep()).orphans).toBe(1);
  });

  it('skips an orphan candidate reserved by an active transaction in another connection', async () => {
    const key = randomUUID();
    const runner = database.database.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(
        'SELECT pg_advisory_xact_lock(hashtextextended(($1::uuid)::text, 0))',
        [key],
      );
      await app.get(QuarantineService).store(key, Buffer.from('pending'));
      const old = new Date(Date.now() - 120000);
      await utimes(join(directory, `${key}.bin`), old, old);
      expect((await maintenance.sweep()).orphans).toBe(0);
      expect((await readdir(directory)).length).toBe(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await maintenance.sweep()).orphans).toBe(1);
  });

  it('never deletes orphan candidates while the database is unavailable', async () => {
    const key = randomUUID();
    await app.get(QuarantineService).store(key, Buffer.from('orphan'));
    const old = new Date(Date.now() - 120000);
    await utimes(join(directory, `${key}.bin`), old, old);
    vi.spyOn(repository, 'retained').mockRejectedValueOnce(
      new Error('unavailable'),
    );
    await expect(maintenance.sweep()).rejects.toThrow();
    expect((await readdir(directory)).length).toBe(1);
  });

  it('redacts request secrets and correlates durable access events', async () => {
    const response = await request(app.getHttpServer())
      .post(`${endpoint}/analyze?token=private-query-secret`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', 'private-client-header')
      .attach('file', suite.files.get('original.png')!, {
        filename: 'private-client-image.png',
        contentType: 'image/png',
      });
    expect(response.status).toBe(200);
    const requestId = response.headers['x-request-id'];
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    await app.get(AuditService).flush();
    const events = await database.database
      .getRepository(AuditEvent)
      .findBy({ requestId });
    expect(events.map((event) => event.event)).toEqual(
      expect.arrayContaining([
        'http.request',
        'analysis.completed',
        'policy.applied',
      ]),
    );
    const evidence = JSON.stringify([events, logs.mock.calls]);
    for (const secret of [
      token,
      'private-query-secret',
      'private-client-header',
      'private-client-image.png',
    ])
      expect(evidence).not.toContain(secret);
  });

  it('does not publish quarantine files through any HTTP route', async () => {
    const posted = await analyze();
    await request(app.getHttpServer())
      .get(`/storage/quarantine/${posted.body.analysis_id}.bin`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/quarantine/${posted.body.analysis_id}.bin`)
      .expect(404);
  });

  it('keeps the historical policy snapshot when runtime settings change', async () => {
    const posted = await analyze();
    policies.POLICY_SUSPICIOUS_ACTION = 'rechazo';
    const historical = await read(posted.body.analysis_id);
    expect(historical.body.policy.settings.suspicious_action).toBe(
      'cuarentena',
    );
    expect((await analyze()).body.action).toBe('rechazo');
  });

  it('does not disclose a result when its mandatory read audit cannot commit', async () => {
    const posted = await analyze('original.png');
    await database.database.query(
      `CREATE FUNCTION reject_read_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = 'analysis.read' THEN RAISE EXCEPTION 'private-read-failure'; END IF; RETURN NEW; END $$`,
    );
    await database.database.query(
      'CREATE TRIGGER reject_read_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_read_audit()',
    );
    try {
      const response = await read(posted.body.analysis_id);
      expect(response.status).toBe(503);
      expect(response.body).not.toHaveProperty('indicators');
      expect(JSON.stringify(response.body)).not.toContain(
        'private-read-failure',
      );
    } finally {
      await database.database.query(
        'DROP TRIGGER reject_read_audit ON audit_events',
      );
      await database.database.query('DROP FUNCTION reject_read_audit()');
    }
  });

  it('repairs an interrupted expiry operation on the next sweep', async () => {
    const posted = await analyze();
    vi.spyOn(repository, 'markFileState').mockRejectedValueOnce(
      new Error('temporary database failure'),
    );
    const expired = new Date(Date.now() + 61000);
    await expect(maintenance.sweep(expired)).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
    await maintenance.sweep(expired);
    expect((await read(posted.body.analysis_id)).body.quarantine.state).toBe(
      'deleted',
    );
  });

  it('returns explicitly incomplete legacy results without inventing statistics', async () => {
    const rows: { analysis_id: string }[] = await database.database.query(
      `INSERT INTO analyses (user_id, filename, sha256, technique, indicators, status, action)
      VALUES ($1, 'legacy.png', $2, 'legacy', '{}', 'no_concluyente', 'advertencia') RETURNING analysis_id`,
      [auth.signing.userId, 'b'.repeat(64)],
    );
    const response = await read(rows[0]!.analysis_id);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      legacy: true,
      policy: null,
      original_filename: null,
      detector_parameters: null,
      indicators: {},
    });
  });
});
