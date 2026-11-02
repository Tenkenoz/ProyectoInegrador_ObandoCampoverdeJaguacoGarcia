import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793275030653 implements MigrationInterface {
    name = 'InitialSchema1793275030653'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cedula" character varying(10) NOT NULL, "nombres" character varying(100) NOT NULL, "apellidos" character varying(100) NOT NULL, "fecha_nacimiento" date NOT NULL, "username" character varying(50) NOT NULL, "email" character varying(150) NOT NULL, "telefono" character varying(10) NOT NULL, "password" character varying(255) NOT NULL, "estado" boolean NOT NULL DEFAULT true, "token_version" integer NOT NULL DEFAULT '0', "version" integer NOT NULL, "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(), "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(), "fecha_eliminacion" TIMESTAMP, CONSTRAINT "CHK_users_telefono" CHECK ("telefono" ~ '^[0-9]{10}$'), CONSTRAINT "CHK_users_cedula" CHECK ("cedula" ~ '^[0-9]{10}$'), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_telefono" ON "users"  ("telefono") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users"  ("email") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_username" ON "users"  ("username") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_cedula" ON "users"  ("cedula") `);
        await queryRunner.query(`CREATE TABLE "user_roles" ("user_id" uuid NOT NULL, "role_id" uuid NOT NULL, "fecha_asignacion" TIMESTAMP NOT NULL DEFAULT now(), "estado" boolean NOT NULL DEFAULT true, "version" integer NOT NULL, "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY ("user_id", "role_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_user_roles_role" ON "user_roles"  ("role_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_user_roles_user" ON "user_roles"  ("user_id") `);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rol" character varying(50) NOT NULL, "estado" boolean NOT NULL DEFAULT true, "version" integer NOT NULL, "fecha_creacion" TIMESTAMP NOT NULL DEFAULT now(), "fecha_actualizacion" TIMESTAMP NOT NULL DEFAULT now(), "fecha_eliminacion" TIMESTAMP, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_roles_rol" ON "roles"  ("rol") `);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_roles" ADD CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_b23c65e50a758245a33ee35fda1"`);
        await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_roles_rol"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_roles_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_user_roles_role"`);
        await queryRunner.query(`DROP TABLE "user_roles"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_cedula"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_username"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_email"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_telefono"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
