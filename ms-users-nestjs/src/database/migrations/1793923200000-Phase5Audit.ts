import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase5Audit1793923200000 implements MigrationInterface {
  name = 'Phase5Audit1793923200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "occurred_at" TIMESTAMP NOT NULL DEFAULT now(),
        "event_type" character varying(64) NOT NULL,
        "actor_id" uuid,
        "subject_id" uuid,
        "action" character varying(128) NOT NULL,
        "resource_id" character varying(128),
        "decision" character varying(16),
        "reason" character varying(64),
        "request_id" character varying(64),
        CONSTRAINT "PK_audit_events_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_occurred_at" ON "audit_events" ("occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_actor" ON "audit_events" ("actor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_subject" ON "audit_events" ("subject_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_event_type" ON "audit_events" ("event_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_request_id" ON "audit_events" ("request_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_events_request_id"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_events_event_type"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_events_subject"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_events_actor"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_events_occurred_at"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
  }
}
