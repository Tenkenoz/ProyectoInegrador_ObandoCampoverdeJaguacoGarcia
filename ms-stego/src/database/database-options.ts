import type { DataSourceOptions } from 'typeorm';
import type { Environment } from '../config/env.js';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AnalysisRetentionAndAudit1793746800000 } from './migrations/1793746800000-AnalysisRetentionAndAudit.js';
import { Analysis } from './entities/analysis.entity.js';
import { InitialAnalyses1793664000000 } from './migrations/1793664000000-InitialAnalyses.js';

export function databaseOptions(env: Environment): DataSourceOptions {
  return {
    type: 'postgres',
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    entities: [Analysis, AuditEvent],
    migrations: [
      InitialAnalyses1793664000000,
      AnalysisRetentionAndAudit1793746800000,
    ],
    migrationsTableName: 'stego_migrations',
    synchronize: false,
    migrationsRun: false,
    logging: false,
    connectTimeoutMS: 5000,
    extra: { statement_timeout: 5000, query_timeout: 6000 },
  };
}
