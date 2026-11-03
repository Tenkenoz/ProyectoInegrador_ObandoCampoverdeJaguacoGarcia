import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AnalysisRetentionAndAudit1793746800000 implements MigrationInterface {
  name = 'AnalysisRetentionAndAudit1793746800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE analyses
      ADD COLUMN metadata jsonb,
      ADD COLUMN policy jsonb,
      ADD COLUMN quarantine_key uuid,
      ADD COLUMN quarantine_expires_at timestamptz,
      ADD COLUMN quarantine_deleted_at timestamptz,
      ADD COLUMN quarantine_state varchar(8) NOT NULL DEFAULT 'none',
      ADD CONSTRAINT analyses_quarantine_state_check CHECK (quarantine_state IN ('none', 'stored', 'deleted', 'missing')),
      ADD CONSTRAINT analyses_quarantine_storage_check CHECK (quarantine_state = 'none' OR (quarantine_key IS NOT NULL AND quarantine_expires_at IS NOT NULL))`);
    await queryRunner.query(
      'CREATE INDEX "IDX_analyses_quarantine_expiry" ON analyses (quarantine_state, quarantine_expires_at)',
    );
    await queryRunner.query(`CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      request_id uuid NOT NULL,
      subject_id uuid,
      resource_id uuid,
      event varchar(64) NOT NULL,
      action varchar(64),
      outcome varchar(8) NOT NULL CONSTRAINT audit_events_outcome_check CHECK (outcome IN ('allowed', 'denied', 'failed')),
      http_status integer CONSTRAINT audit_events_http_status_check CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
      details jsonb NOT NULL
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_events_request_created" ON audit_events (request_id, created_at)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE audit_events');
    await queryRunner.query('DROP INDEX "IDX_analyses_quarantine_expiry"');
    await queryRunner.query(`ALTER TABLE analyses
      DROP CONSTRAINT analyses_quarantine_storage_check,
      DROP CONSTRAINT analyses_quarantine_state_check,
      DROP COLUMN quarantine_state,
      DROP COLUMN quarantine_deleted_at,
      DROP COLUMN quarantine_expires_at,
      DROP COLUMN quarantine_key,
      DROP COLUMN policy,
      DROP COLUMN metadata`);
  }
}
