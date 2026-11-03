import 'reflect-metadata';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { Role } from '../roles/entities/role.entity.js';
import { UserRole } from '../user-roles/entities/user-role.entity.js';
import { User } from '../users/entities/user.entity.js';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable is not defined: ${key}`);
  }
  return value;
}

const port = Number(required('DB_PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT must be a valid port');
}

export default new DataSource({
  type: 'postgres',
  host: required('DB_HOST'),
  port,
  username: required('DB_USERNAME'),
  password: required('DB_PASSWORD'),
  database: required('DB_DATABASE'),
  entities: [User, Role, UserRole],
  migrations: [fileURLToPath(new URL('./migrations/*.js', import.meta.url))],
  synchronize: false,
  migrationsRun: false,
  logging: ['error'],
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  extra: {
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  },
});
