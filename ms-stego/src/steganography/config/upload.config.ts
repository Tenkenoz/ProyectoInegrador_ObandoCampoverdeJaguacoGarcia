import { z } from 'zod';

export const UPLOAD_CONFIG = Symbol('UPLOAD_CONFIG');
export const IMAGE_WORKER_URL = Symbol('IMAGE_WORKER_URL');

const schema = z.object({
  UPLOAD_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(20971520)
    .default(5242880),
  IMAGE_MAX_WIDTH: z.coerce.number().int().min(1).max(8192).default(4096),
  IMAGE_MAX_HEIGHT: z.coerce.number().int().min(1).max(8192).default(4096),
  IMAGE_MAX_PIXELS: z.coerce
    .number()
    .int()
    .min(1)
    .max(16000000)
    .default(4000000),
  IMAGE_DECODE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(3000),
  UPLOAD_MAX_CONCURRENT: z.coerce.number().int().min(1).max(4).default(2),
});

export type UploadConfiguration = z.infer<typeof schema>;

export function validateUploadConfiguration(
  values: Record<string, unknown>,
): UploadConfiguration {
  const result = schema.safeParse(values);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid upload configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
