import {
  Logger,
} from '@nestjs/common';

import {
  NestFactory,
} from '@nestjs/core';

import * as argon2 from 'argon2';

import {
  DataSource,
  Repository,
} from 'typeorm';

import {
  AppModule,
} from '../app.module.js';

import {
  User,
} from '../users/entities/user.entity.js';

import {
  Role,
} from '../roles/entities/role.entity.js';

import {
  UserRole,
} from '../user-roles/entities/user-role.entity.js';

const logger =
  new Logger('DatabaseSeed');

/*
 * ============================================================
 * ROLES
 * ============================================================
 */

const rolesSeed = [
  'ADMIN',
  'CLIENTE',
  'OPERADOR',
] as const;

/*
 * ============================================================
 * USUARIOS
 * ============================================================
 */

const usersSeed = [

  {
    cedula: '1712345675',
    nombres: 'Juan Carlos',
    apellidos: 'Pérez López',
    fechaNacimiento: '1990-05-15',
    username: 'jperez',
    email: 'jperez@example.com',
    telefono: '0991000001',
    password: 'ClaveSegura2026!',
    estado: true,

    roles: [
      'ADMIN',
    ],
  },

  {
    cedula: '1723456784',
    nombres: 'María Fernanda',
    apellidos: 'Gómez Ruiz',
    fechaNacimiento: '1992-08-20',
    username: 'mgomez',
    email: 'mgomez@example.com',
    telefono: '0991000002',
    password: 'ClaveSegura2026!',
    estado: true,

    roles: [
      'CLIENTE',
    ],
  },

  {
    cedula: '0503495350',
    nombres: 'Carlos Andrés',
    apellidos: 'Vega Torres',
    fechaNacimiento: '1988-11-10',
    username: 'cvega',
    email: 'cvega@example.com',
    telefono: '0991000003',
    password: 'ClaveSegura2026!',
    estado: true,

    roles: [
      'CLIENTE',
      'OPERADOR',
    ],
  },

  {
    cedula: '1102345673',
    nombres: 'Ana Lucía',
    apellidos: 'Mendoza Silva',
    fechaNacimiento: '1995-03-25',
    username: 'amendoza',
    email: 'amendoza@example.com',
    telefono: '0991000004',
    password: 'ClaveSegura2026!',
    estado: true,

    roles: [
      'OPERADOR',
    ],
  },

  {
    cedula: '0912345675',
    nombres: 'Luis Alberto',
    apellidos: 'Castro Molina',
    fechaNacimiento: '1998-07-12',
    username: 'lcastro',
    email: 'lcastro@example.com',
    telefono: '0991000005',
    password: 'ClaveSegura2026!',
    estado: true,

    roles: [
      'CLIENTE',
    ],
  },

] as const;

/*
 * ============================================================
 * CREAR O RECUPERAR ROL
 * ============================================================
 */

async function createOrGetRole(
  repository: Repository<Role>,
  roleName: string,
): Promise<Role> {

  const existingRole =
    await repository.findOne({

      where: {
        rol: roleName,
      },

      /*
       * También busca roles eliminados
       * mediante soft delete.
       */
      withDeleted: true,
    });

  /*
   * Si ya existe, lo reutilizamos.
   */
  if (existingRole) {

    /*
     * Si estaba eliminado lógicamente,
     * lo restauramos.
     */
    if (
      existingRole.fechaEliminacion
    ) {

      await repository.restore(
        existingRole.id,
      );
    }

    existingRole.estado =
      true;

    return repository.save(
      existingRole,
    );
  }

  /*
   * Si no existe, lo creamos.
   */
  const newRole =
    repository.create({

      rol: roleName,

      estado: true,
    });

  return repository.save(
    newRole,
  );
}

/*
 * ============================================================
 * BUSCAR USUARIO POR CAMPOS ÚNICOS
 * ============================================================
 */

async function findExistingUser(
  repository: Repository<User>,
  data: (typeof usersSeed)[number],
): Promise<User | null> {

  /*
   * IMPORTANTE:
   *
   * La entidad User tiene índices únicos en:
   *
   * cedula
   * username
   * email
   * telefono
   *
   * Por eso debemos revisar TODOS.
   */

  const users =
    await repository.find({

      where: [

        {
          cedula:
            data.cedula,
        },

        {
          username:
            data.username,
        },

        {
          email:
            data.email,
        },

        {
          telefono:
            data.telefono,
        },
      ],

      /*
       * Incluimos usuarios eliminados
       * lógicamente porque sus valores
       * UNIQUE siguen existiendo en PostgreSQL.
       */
      withDeleted: true,
    });

  /*
   * Ninguna coincidencia.
   *
   * Podemos crear un usuario nuevo.
   */
  if (
    users.length === 0
  ) {

    return null;
  }

  /*
   * Obtenemos IDs diferentes.
   */
  const uniqueIds =
    new Set(
      users.map(
        (user) =>
          user.id,
      ),
    );

  /*
   * Si distintos campos pertenecen a
   * usuarios diferentes tenemos un
   * conflicto real.
   *
   * Ejemplo:
   *
   * cedula -> usuario A
   * email  -> usuario B
   *
   * No debemos modificar ninguno
   * automáticamente.
   */
  if (
    uniqueIds.size > 1
  ) {

    logger.error(
      `Conflicto detectado para ${data.username}`,
    );

    for (
      const user
      of users
    ) {

      logger.error(
        [
          `ID=${user.id}`,
          `cedula=${user.cedula}`,
          `username=${user.username}`,
          `email=${user.email}`,
          `telefono=${user.telefono}`,
        ].join(' | '),
      );
    }

    throw new Error(
      [
        'Existen varios usuarios que coinciden',
        'con diferentes campos únicos.',
        `Usuario seed: ${data.username}`,
      ].join(' '),
    );
  }

  /*
   * Todos los campos encontrados pertenecen
   * al mismo registro.
   */
  return users[0];
}

/*
 * ============================================================
 * CREAR O ACTUALIZAR USUARIO
 * ============================================================
 */

async function createOrUpdateUser(
  repository: Repository<User>,
  data: (typeof usersSeed)[number],
): Promise<User> {

  /*
   * Buscamos por:
   *
   * - cedula
   * - username
   * - email
   * - telefono
   */
  let user =
    await findExistingUser(
      repository,
      data,
    );

  /*
   * Password nunca se almacena directamente.
   */
  const passwordHash =
    await argon2.hash(
      data.password,
      {
        type:
          argon2.argon2id,
      },
    );

  /*
   * ==========================================================
   * USUARIO EXISTENTE
   * ==========================================================
   */

  if (user) {

    logger.log(
      `Usuario existente encontrado: ${user.username}`,
    );

    /*
     * Si tenía soft delete lo restauramos.
     */
    if (
      user.fechaEliminacion
    ) {

      await repository.restore(
        user.id,
      );

      logger.log(
        `Usuario restaurado: ${user.username}`,
      );
    }

    /*
     * Actualizamos sus datos con los valores
     * definidos en el seed.
     */
    user.cedula =
      data.cedula;

    user.nombres =
      data.nombres;

    user.apellidos =
      data.apellidos;

    user.fechaNacimiento =
      data.fechaNacimiento;

    user.username =
      data.username;

    user.email =
      data.email;

    user.telefono =
      data.telefono;

    user.passwordHash =
      passwordHash;

    user.estado =
      data.estado;

    /*
     * Guardamos.
     */
    return repository.save(
      user,
    );
  }

  /*
   * ==========================================================
   * NUEVO USUARIO
   * ==========================================================
   */

  logger.log(
    `Creando usuario: ${data.username}`,
  );

  user =
    repository.create({

      cedula:
        data.cedula,

      nombres:
        data.nombres,

      apellidos:
        data.apellidos,

      fechaNacimiento:
        data.fechaNacimiento,

      username:
        data.username,

      email:
        data.email,

      telefono:
        data.telefono,

      passwordHash,

      estado:
        data.estado,
    });

  return repository.save(
    user,
  );
}

/*
 * ============================================================
 * ASIGNAR ROL AL USUARIO
 * ============================================================
 */

async function assignRole(
  repository: Repository<UserRole>,
  user: User,
  role: Role,
): Promise<void> {

  /*
   * Comprobamos si la relación ya existe.
   *
   * PK:
   *
   * user_id + role_id
   */
  const existingRelation =
    await repository.findOne({

      where: {

        userId:
          user.id,

        roleId:
          role.id,
      },
    });

  /*
   * Si existe, no debemos crearla nuevamente.
   */
  if (
    existingRelation
  ) {

    /*
     * Si estaba desactivada,
     * la activamos.
     */
    if (
      !existingRelation.estado
    ) {

      existingRelation.estado =
        true;

      await repository.save(
        existingRelation,
      );

      logger.log(
        `Rol ${role.rol} reactivado para ${user.username}`,
      );

    } else {

      logger.log(
        `Rol ${role.rol} ya asignado a ${user.username}`,
      );
    }

    return;
  }

  /*
   * Crear nueva relación.
   */
  const userRole =
    repository.create({

      userId:
        user.id,

      roleId:
        role.id,

      estado:
        true,
    });

  await repository.save(
    userRole,
  );

  logger.log(
    `Rol ${role.rol} asignado a ${user.username}`,
  );
}

/*
 * ============================================================
 * FUNCIÓN PRINCIPAL DEL SEED
 * ============================================================
 */

async function seed(): Promise<void> {

  /*
   * createApplicationContext()
   *
   * Levanta NestJS pero NO levanta
   * el servidor HTTP.
   *
   * Por tanto reutilizamos:
   *
   * AppModule
   * ConfigModule
   * TypeOrmModule
   * .env
   * PostgreSQL
   *
   * No necesitamos data-source.ts
   */
  const app =
    await NestFactory
      .createApplicationContext(
        AppModule,
        {

          logger: [
            'log',
            'error',
            'warn',
          ],
        },
      );

  try {

    logger.log(
      '========================================',
    );

    logger.log(
      'Iniciando siembra de base de datos...',
    );

    logger.log(
      '========================================',
    );

    /*
     * DataSource ya fue creado por
     * TypeOrmModule.forRoot()
     * o TypeOrmModule.forRootAsync()
     * dentro de AppModule.
     */
    const dataSource =
      app.get(
        DataSource,
      );

    /*
     * ========================================================
     * REPOSITORIOS
     * ========================================================
     */

    const roleRepository =
      dataSource.getRepository(
        Role,
      );

    const userRepository =
      dataSource.getRepository(
        User,
      );

    const userRoleRepository =
      dataSource.getRepository(
        UserRole,
      );

    /*
     * ========================================================
     * CREAR ROLES
     * ========================================================
     */

    logger.log(
      '',
    );

    logger.log(
      'Registrando roles...',
    );

    const roles =
      new Map<
        string,
        Role
      >();

    for (
      const roleName
      of rolesSeed
    ) {

      const role =
        await createOrGetRole(
          roleRepository,
          roleName,
        );

      roles.set(
        roleName,
        role,
      );

      logger.log(
        `Rol disponible: ${role.rol}`,
      );
    }

    /*
     * ========================================================
     * CREAR USUARIOS
     * ========================================================
     */

    logger.log(
      '',
    );

    logger.log(
      'Registrando usuarios...',
    );

    for (
      const userData
      of usersSeed
    ) {

      /*
       * Crear o actualizar usuario.
       */
      const user =
        await createOrUpdateUser(
          userRepository,
          userData,
        );

      logger.log(
        `Usuario disponible: ${user.username}`,
      );

      /*
       * ======================================================
       * ASIGNAR ROLES
       * ======================================================
       */

      for (
        const roleName
        of userData.roles
      ) {

        const role =
          roles.get(
            roleName,
          );

        if (
          !role
        ) {

          throw new Error(
            `Rol no encontrado en memoria: ${roleName}`,
          );
        }

        await assignRole(
          userRoleRepository,
          user,
          role,
        );
      }
    }

    /*
     * ========================================================
     * RESUMEN
     * ========================================================
     */

    const totalUsers =
      await userRepository.count();

    const totalRoles =
      await roleRepository.count();

    const totalUserRoles =
      await userRoleRepository.count();

    logger.log(
      '',
    );

    logger.log(
      '========================================',
    );

    logger.log(
      'SIEMBRA COMPLETADA CORRECTAMENTE',
    );

    logger.log(
      '========================================',
    );

    logger.log(
      `Usuarios activos en BD: ${totalUsers}`,
    );

    logger.log(
      `Roles activos en BD: ${totalRoles}`,
    );

    logger.log(
      `Asignaciones usuario-rol: ${totalUserRoles}`,
    );

    logger.log(
      '========================================',
    );

  } catch (
    error: unknown
  ) {

    logger.error(
      '========================================',
    );

    logger.error(
      'ERROR DURANTE LA SIEMBRA',
    );

    logger.error(
      '========================================',
    );

    if (
      error instanceof Error
    ) {

      logger.error(
        error.message,
      );

      logger.error(
        error.stack,
      );

    } else {

      logger.error(
        String(
          error,
        ),
      );
    }

    /*
     * El proceso finalizará con código 1.
     */
    process.exitCode =
      1;

  } finally {

    /*
     * Cerramos NestJS y la conexión
     * PostgreSQL correctamente.
     */
    await app.close();
  }
}

/*
 * ============================================================
 * EJECUTAR
 * ============================================================
 */

await seed();