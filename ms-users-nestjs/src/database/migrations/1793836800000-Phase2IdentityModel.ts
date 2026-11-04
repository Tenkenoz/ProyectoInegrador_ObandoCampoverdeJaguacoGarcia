import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2IdentityModel1793836800000 implements MigrationInterface {
  name = 'Phase2IdentityModel1793836800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "PK_23ed6f04fe43066df08379fd034"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "PK_user_roles_id" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_roles_user_role" ON "user_roles" ("user_id", "role_id")`,
    );

    /*
     * Merge the legacy OPERADOR role into ANALYST without losing assignments.
     */
    await queryRunner.query(`
      INSERT INTO "user_roles" ("user_id", "role_id", "estado", "version")
      SELECT user_role."user_id", analyst."id", user_role."estado", user_role."version"
      FROM "user_roles" user_role
      JOIN "roles" legacy_role
        ON legacy_role."id" = user_role."role_id"
       AND legacy_role."rol" = 'OPERADOR'
      JOIN "roles" analyst
        ON analyst."rol" = 'ANALYST'
      ON CONFLICT ("user_id", "role_id") DO NOTHING
    `);
    await queryRunner.query(`
      DELETE FROM "user_roles"
      WHERE "role_id" IN (
        SELECT "id" FROM "roles" WHERE "rol" = 'OPERADOR'
      )
      AND EXISTS (
        SELECT 1 FROM "roles" WHERE "rol" = 'ANALYST'
      )
    `);
    await queryRunner.query(`
      UPDATE "roles"
      SET "rol" = 'ANALYST'
      WHERE "rol" = 'OPERADOR'
        AND NOT EXISTS (
          SELECT 1 FROM "roles" WHERE "rol" = 'ANALYST'
        )
    `);
    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "rol" = 'OPERADOR'
        AND EXISTS (
          SELECT 1 FROM "roles" WHERE "rol" = 'ANALYST'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("rol", "estado", "version")
      VALUES
        ('ADMIN', true, 1),
        ('ANALYST', true, 1),
        ('USER', true, 1)
      ON CONFLICT ("rol") DO NOTHING
    `);
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "CHK_roles_rol" CHECK ("rol" IN ('ADMIN', 'ANALYST', 'USER'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "CHK_roles_rol"`,
    );
    await queryRunner.query(`DROP INDEX "UQ_user_roles_user_role"`);
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "PK_user_roles_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY ("user_id", "role_id")`,
    );
    await queryRunner.query(`ALTER TABLE "user_roles" DROP COLUMN "id"`);
  }
}
