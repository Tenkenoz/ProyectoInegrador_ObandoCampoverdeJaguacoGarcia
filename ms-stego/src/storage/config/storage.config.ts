import { resolve, isAbsolute } from 'node:path';
import { z } from 'zod';

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');
const schema = z.object({
  QUARANTINE_DIR: z
    .string()
    .min(1)
    .refine(isAbsolute)
    .default(resolve('storage/quarantine')),
  QUARANTINE_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(604800)
    .default(86400),
  QUARANTINE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1073741824)
    .default(104857600),
  QUARANTINE_MAX_FILES: z.coerce.number().int().min(1).max(1000).default(100),
  QUARANTINE_CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3600000)
    .default(60000),
  QUARANTINE_ORPHAN_GRACE_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86400)
    .default(300),
});
export type StorageConfiguration = z.infer<typeof schema>;

export function validateStorageConfiguration(
  values: Record<string, unknown>,
): StorageConfiguration {
  const result = schema.safeParse(values);
  if (!result.success) throw new Error('Invalid quarantine configuration');
  return result.data;
}
