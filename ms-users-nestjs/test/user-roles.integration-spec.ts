import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PasswordHasher } from '../src/common/security/password-hasher.service.js';
import { InitialSchema1793275030653 } from '../src/database/migrations/1793275030653-InitialSchema.js';
import { Phase2IdentityModel1793836800000 } from '../src/database/migrations/1793836800000-Phase2IdentityModel.js';
import { Role } from '../src/roles/entities/role.entity.js';
import { RolesService } from '../src/roles/roles.service.js';
import type { ListUserRolesQueryDto } from '../src/user-roles/dto/list-user-roles-query.dto.js';
import { UserRole } from '../src/user-roles/entities/user-role.entity.js';
import { UserRolesService } from '../src/user-roles/user-roles.service.js';
import { User } from '../src/users/entities/user.entity.js';
import { UsersService } from '../src/users/users.service.js';

const describeDatabase =
  process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

describeDatabase('User roles persistence', () => {
  let dataSource: DataSource;
  let userRolesService: UserRolesService;
  let usersService: UsersService;
  let adminRole: Role;
  let analystRole: Role;
  let userRole: Role;
  let userA: User;
  let userB: User;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 55432),
      username: process.env.DB_USERNAME ?? 'user_app',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'auth_test',
      entities: [User, Role, UserRole],
      migrations: [
        InitialSchema1793275030653,
        Phase2IdentityModel1793836800000,
      ],
      synchronize: false,
      logging: false,
    });

    await dataSource.initialize();
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await dataSource.runMigrations();

    const userRepository = dataSource.getRepository(User);
    const roleRepository = dataSource.getRepository(Role);
    const userRoleRepository = dataSource.getRepository(UserRole);
    const passwordHasher = new PasswordHasher();

    usersService = new UsersService(userRepository, passwordHasher);
    const rolesService = new RolesService(roleRepository);
    userRolesService = new UserRolesService(
      userRoleRepository,
      usersService,
      rolesService,
    );
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "user_roles", "users" CASCADE');

    const roleRepository = dataSource.getRepository(Role);
    adminRole = await roleRepository.findOneByOrFail({ rol: 'ADMIN' });
    analystRole = await roleRepository.findOneByOrFail({ rol: 'ANALYST' });
    userRole = await roleRepository.findOneByOrFail({ rol: 'USER' });

    userA = await usersService.create({
      cedula: '1712345678',
      nombres: 'Alice',
      apellidos: 'Admin',
      fechaNacimiento: '1990-01-01',
      username: 'alice',
      email: 'alice@example.com',
      telefono: '0990000001',
      password: 'ValidPassword123!',
    });
    userB = await usersService.create({
      cedula: '1712345679',
      nombres: 'Bob',
      apellidos: 'Analyst',
      fechaNacimiento: '1991-02-02',
      username: 'bob',
      email: 'bob@example.com',
      telefono: '0990000002',
      password: 'ValidPassword123!',
    });
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('persists two roles for one user and one role for two users', async () => {
    await userRolesService.create({
      userId: userA.id,
      roleId: adminRole.id,
    });
    await userRolesService.create({
      userId: userA.id,
      roleId: analystRole.id,
    });
    await userRolesService.create({
      userId: userB.id,
      roleId: adminRole.id,
    });

    const userARoles = await userRolesService.findByUser(userA.id);
    const adminAssignments = await dataSource.getRepository(UserRole).find({
      where: { roleId: adminRole.id },
    });

    expect(userARoles.map((assignment) => assignment.role.rol).sort()).toEqual([
      'ADMIN',
      'ANALYST',
    ]);
    expect(adminAssignments).toHaveLength(2);
  });

  it('rejects a duplicate active assignment without creating a second row', async () => {
    await userRolesService.create({
      userId: userA.id,
      roleId: adminRole.id,
    });

    await expect(
      userRolesService.create({
        userId: userA.id,
        roleId: adminRole.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      dataSource.getRepository(UserRole).count({
        where: {
          userId: userA.id,
          roleId: adminRole.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('revokes and reactivates an assignment without creating a duplicate', async () => {
    const assignment = await userRolesService.create({
      userId: userA.id,
      roleId: adminRole.id,
    });

    await userRolesService.remove(assignment.id);

    await expect(
      userRolesService.findOne(assignment.id),
    ).resolves.toMatchObject({
      id: assignment.id,
      estado: false,
    });

    const reactivated = await userRolesService.create({
      userId: userA.id,
      roleId: adminRole.id,
    });

    expect(reactivated).toMatchObject({
      id: assignment.id,
      estado: true,
    });
    await expect(
      dataSource.getRepository(UserRole).count({
        where: {
          userId: userA.id,
          roleId: adminRole.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('filters and paginates assignments', async () => {
    await userRolesService.create({
      userId: userA.id,
      roleId: adminRole.id,
    });
    await userRolesService.create({
      userId: userA.id,
      roleId: analystRole.id,
    });
    await userRolesService.create({
      userId: userB.id,
      roleId: userRole.id,
    });

    const all = await userRolesService.findAll({
      page: 1,
      limit: 10,
    } as ListUserRolesQueryDto);
    const filtered = await userRolesService.findAll({
      page: 1,
      limit: 10,
      userId: userA.id,
    } as ListUserRolesQueryDto);

    expect(all.meta).toEqual({
      page: 1,
      limit: 10,
      total: 3,
      totalPages: 1,
    });
    expect(filtered.data).toHaveLength(2);
  });
});
