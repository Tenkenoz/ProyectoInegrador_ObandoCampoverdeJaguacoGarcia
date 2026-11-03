import { createPublicKey } from 'node:crypto';
import type { JSONWebKeySet } from 'jose';
import { z } from 'zod';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';

const keySchema = z
  .object({
    kty: z.literal('RSA'),
    kid: z.string().min(1).max(128),
    alg: z.literal('RS256').optional(),
    use: z.literal('sig').optional(),
    key_ops: z.array(z.literal('verify')).length(1).optional(),
    n: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .min(342)
      .max(1366),
    e: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .min(1)
      .max(16),
  })
  .passthrough();

const schema = z.object({ keys: z.array(keySchema).min(1).max(16) });

export function parseJwks(value: unknown): JSONWebKeySet {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AuthDependencyError();
  const ids = new Set<string>();
  for (const key of parsed.data.keys) {
    if (
      ids.has(key.kid) ||
      ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(
        (field) => field in key,
      )
    ) {
      throw new AuthDependencyError();
    }
    ids.add(key.kid);
    try {
      const publicKey = createPublicKey({ key, format: 'jwk' });
      if ((publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
        throw new AuthDependencyError();
    } catch {
      throw new AuthDependencyError();
    }
  }
  return parsed.data;
}
