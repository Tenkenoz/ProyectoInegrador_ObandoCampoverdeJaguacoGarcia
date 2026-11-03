import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialAnalyses1793664000000 implements MigrationInterface {
  name = 'InitialAnalyses1793664000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE analyses (
        analysis_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        filename varchar(255) NOT NULL,
        sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        technique varchar(100) NOT NULL,
        indicators jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        status varchar(20) NOT NULL CHECK (status IN ('sin_indicios', 'sospechoso', 'no_concluyente', 'error')),
        action varchar(20) NOT NULL CHECK (action IN ('advertencia', 'cuarentena', 'rechazo'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_analyses_user_created" ON analyses (user_id, created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE analyses');
  }
}
