import { z } from 'zod';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
});

const schema = z.object({
  AUTH_BASE_URL: httpsUrl
    .default('https://auth:3001')
    .refine((value) => new URL(value).pathname === '/'),
  AUTH_JWKS_URL: httpsUrl.default('https://auth:3001/.well-known/jwks.json'),
  AUTH_CA_CERT_PATH: z.string().trim().min(1),
  AUTH_SERVICE_ID: z.literal('stego').default('stego'),
  AUTH_SERVICE_SECRET: z.string().regex(/^[a-fA-F0-9]{64}$/),
  AUTH_TIMEOUT_MS: z.coerce.number().int().min(1).max(30000).default(3000),
});

export type AuthConfiguration = z.infer<typeof schema>;

export function validateAuthConfiguration(
  values: Record<string, unknown>,
): AuthConfiguration {
  const result = schema.safeParse(values);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(
      `Invalid authentication configuration: ${fields.join(', ')}`,
    );
  }
  return result.data;
}
