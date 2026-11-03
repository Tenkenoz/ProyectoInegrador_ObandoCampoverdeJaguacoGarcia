import { randomUUID } from 'node:crypto';
import { Analysis } from '../src/database/entities/analysis.entity.js';
import { AuditEvent } from '../src/database/entities/audit-event.entity.js';
import {
  AnalysisRepository,
  type AnalysisDraft,
} from '../src/persistence/analysis.repository.js';
import { validatePolicyConfiguration } from '../src/steganography/policy/config/policy.config.js';
import { selectPolicy } from '../src/steganography/policy/utils/select-policy.js';
import { createPostgresFixture } from './helpers/postgres-fixture.js';

describe('Persistent analysis and audit transactions', () => {
  let fixture: Awaited<ReturnType<typeof createPostgresFixture>>;
  let repository: AnalysisRepository;
  beforeAll(async () => {
    fixture = await createPostgresFixture();
    repository = new AnalysisRepository(fixture.database);
  });
  afterEach(async () => {
    await fixture.database.runMigrations();
    await fixture.database.query('TRUNCATE analyses, audit_events');
  });
  afterAll(async () => {
    await fixture?.dispose();
  });

  const draft = (): AnalysisDraft => ({
    id: randomUUID(),
    userId: randomUUID(),
    filename: 'generated.png',
    sha256: 'a'.repeat(64),
    technique: 'lsb_chi_square_v1',
    indicators: { p_value: null },
    status: 'no_concluyente',
    action: 'advertencia',
    metadata: null,
    policy: selectPolicy(
      'no_concluyente',
      validatePolicyConfiguration({}),
      86400,
    ),
    quarantineKey: null,
    quarantineExpiresAt: null,
    quarantineDeletedAt: null,
    quarantineState: 'none',
  });

  it('commits the analysis and its critical audit events together', async () => {
    const requestId = randomUUID();
    const row = await repository.create(draft(), requestId);
    expect(await repository.findById(row.id)).toMatchObject({
      id: row.id,
      indicators: { p_value: null },
    });
    const events = await fixture.database
      .getRepository(AuditEvent)
      .findBy({ requestId });
    expect(events.map((event) => event.event).sort()).toEqual([
      'analysis.completed',
      'policy.applied',
    ]);
  });

  it('rolls back the analysis when audit persistence fails', async () => {
    await fixture.database.query(
      `CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-test-database-failure'; END $$`,
    );
    await fixture.database.query(
      'CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_test_audit()',
    );
    try {
      await expect(repository.create(draft(), randomUUID())).rejects.toThrow();
      expect(await fixture.database.getRepository(Analysis).count()).toBe(0);
    } finally {
      await fixture.database.query(
        'DROP TRIGGER reject_test_audit ON audit_events',
      );
      await fixture.database.query('DROP FUNCTION reject_test_audit()');
    }
  });

  it('upgrades legacy rows without fabricating missing evidence', async () => {
    await fixture.database.undoLastMigration();
    const rows: { analysis_id: string }[] = await fixture.database.query(
      `INSERT INTO analyses (user_id, filename, sha256, technique, indicators, status, action)
      VALUES ($1, 'legacy.png', $2, 'legacy', '{}', 'no_concluyente', 'advertencia') RETURNING analysis_id`,
      [randomUUID(), 'b'.repeat(64)],
    );
    await fixture.database.runMigrations();
    expect(await repository.findById(rows[0]!.analysis_id)).toMatchObject({
      metadata: null,
      policy: null,
      quarantineState: 'none',
    });
  });

  it('keeps the migrated schema aligned with the entity model', async () => {
    const changes = await fixture.database.driver.createSchemaBuilder().log();
    expect(changes.upQueries.map((query) => query.query)).toEqual([]);
  });
});
