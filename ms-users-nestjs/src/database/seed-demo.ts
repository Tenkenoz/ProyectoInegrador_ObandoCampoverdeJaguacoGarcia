import * as argon2 from 'argon2';

import dataSource from './data-source.js';
import { Role } from '../roles/entities/role.entity.js';
import type { RoleName } from '../roles/role.constants.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';
import { User } from '../users/entities/user.entity.js';

/*
 * Demo seed for the integration rehearsal and the final presentation.
 *
 * - It never creates roles: ADMIN, ANALYST and USER come from the migrations.
 * - It is idempotent: existing users and assignments are left untouched.
 * - It refuses to run unless SEED_DEMO=1 is explicitly provided.
 */

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

interface DemoUser {
  username: string;
  roles: RoleName[];
  cedula: string;
  telefono: string;
  nombres: string;
  apellidos: string;
  email: string;
  fechaNacimiento: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    username: 'admin',
    roles: ['ADMIN'],
    cedula: '1700000001',
    telefono: '0990000001',
    nombres: 'Admin',
    apellidos: 'Demo',
    email: 'admin@demo.local',
    fechaNacimiento: '1990-01-01',
  },
  {
    username: 'analyst.one',
    roles: ['ANALYST'],
    cedula: '1700000002',
    telefono: '0990000002',
    nombres: 'Analista',
    apellidos: 'Uno',
    email: 'analyst.one@demo.local',
    fechaNacimiento: '1991-02-02',
  },
  {
    username: 'analyst.two',
    roles: ['ANALYST'],
    cedula: '1700000003',
    telefono: '0990000003',
    nombres: 'Analista',
    apellidos: 'Dos',
    email: 'analyst.two@demo.local',
    fechaNacimiento: '1992-03-03',
  },
  {
    username: 'user.standard',
    roles: ['USER'],
    cedula: '1700000004',
    telefono: '0990000004',
    nombres: 'Usuario',
    apellidos: 'Estandar',
    email: 'user.standard@demo.local',
    fechaNacimiento: '1993-04-04',
  },
  {
    username: 'dual.role',
    roles: ['ADMIN', 'ANALYST'],
    cedula: '1700000005',
    telefono: '0990000005',
    nombres: 'Doble',
    apellidos: 'Rol',
    email: 'dual.role@demo.local',
    fechaNacimiento: '1994-05-05',
  },
];

const counters = {
  usersCreated: 0,
  usersSkipped: 0,
  assignmentsCreated: 0,
  assignmentsSkipped: 0,
  rolesMissing: 0,
};

function readPassword(): string {
  const password = process.env.SEED_DEFAULT_PASSWORD ?? 'DemoSeguro2026!';
  if (password.length < 12) {
    throw new Error('SEED_DEFAULT_PASSWORD must contain at least 12 characters');
  }
  return password;
}

async function seedUser(
  demo: DemoUser,
  passwordHash: string,
): Promise<void> {
  const users = dataSource.getRepository(User);
  const roles = dataSource.getRepository(Role);
  const assignments = dataSource.getRepository(UserRole);

  let user = await users.findOne({ where: { username: demo.username } });

  if (user) {
    counters.usersSkipped += 1;
    console.log(`[seed] user ${demo.username}: skipped (already exists)`);
  } else {
    user = await users.save(
      users.create({
        username: demo.username,
        cedula: demo.cedula,
        telefono: demo.telefono,
        nombres: demo.nombres,
        apellidos: demo.apellidos,
        email: demo.email,
        fechaNacimiento: demo.fechaNacimiento,
        passwordHash,
        estado: true,
      }),
    );
    counters.usersCreated += 1;
    console.log(`[seed] user ${demo.username}: created`);
  }

  for (const roleName of demo.roles) {
    const role = await roles.findOne({ where: { rol: roleName } });
    if (!role) {
      counters.rolesMissing += 1;
      console.warn(
        `[seed] role ${roleName}: missing, run the migrations first (assignment skipped)`,
      );
      continue;
    }

    const existing = await assignments.findOne({
      where: { userId: user.id, roleId: role.id },
    });

    if (existing) {
      counters.assignmentsSkipped += 1;
      console.log(
        `[seed] assignment ${demo.username} -> ${roleName}: skipped (already exists)`,
      );
      continue;
    }

    await assignments.save(
      assignments.create({
        userId: user.id,
        roleId: role.id,
        estado: true,
      }),
    );
    counters.assignmentsCreated += 1;
    console.log(`[seed] assignment ${demo.username} -> ${roleName}: created`);
  }
}

async function main(): Promise<void> {
  if (process.env.SEED_DEMO !== '1') {
    throw new Error(
      'Refusing to run: set SEED_DEMO=1 to confirm this is a demo database',
    );
  }

  const passwordHash = await argon2.hash(readPassword(), ARGON2_OPTIONS);

  await dataSource.initialize();

  try {
    for (const demo of DEMO_USERS) {
      await seedUser(demo, passwordHash);
    }

    console.log(
      [
        '[seed] summary',
        `users created=${counters.usersCreated} skipped=${counters.usersSkipped}`,
        `assignments created=${counters.assignmentsCreated} skipped=${counters.assignmentsSkipped}`,
        `missing roles=${counters.rolesMissing}`,
      ].join(' | '),
    );

    if (counters.rolesMissing > 0) {
      process.exitCode = 2;
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
