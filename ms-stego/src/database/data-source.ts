import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnvironment } from '../config/env.js';
import { databaseOptions } from './database-options.js';

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default new DataSource(
  databaseOptions(validateEnvironment(process.env)),
);
