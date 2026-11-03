import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: port.default(3002),
  DB_HOST: z.string().trim().min(1).default('127.0.0.1'),
  DB_PORT: port.default(5433),
  DB_USERNAME: z.string().trim().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_DATABASE: z.string().trim().min(1),
});

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const result = schema.safeParse(config);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid environment variables: ${fields.join(', ')}`);
  }
  return result.data;
}
