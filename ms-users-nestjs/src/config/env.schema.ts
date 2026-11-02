import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  TRUST_PROXY: z.string().optional(),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),

  DB_USERNAME: z.string().min(1),

  DB_PASSWORD: z.string().min(12),

  DB_DATABASE: z.string().min(1),

  DB_SSL: z.enum(['true', 'false']).default('false'),

  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  RATE_LIMIT_BLOCK_MS: z.coerce.number().int().positive().default(60000),

  /*
   * JWT
   */

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),

  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),

  JWT_ISSUER: z.string().min(1).default('user-service'),

  JWT_AUDIENCE: z.string().min(1).default('secure-shop-api'),
});
