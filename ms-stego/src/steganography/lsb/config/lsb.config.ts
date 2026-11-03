import { z } from 'zod';

export const LSB_CONFIG = Symbol('LSB_CONFIG');

const schema = z
  .object({
    LSB_SUSPICIOUS_THRESHOLD: z.coerce.number().gt(0).lt(1).default(0.05),
    LSB_CLEAR_THRESHOLD: z.coerce.number().gt(0).lt(1).default(0.001),
    LSB_BALANCE_TOLERANCE: z.coerce.number().gt(0).max(0.1).default(0.02),
    LSB_MIN_PIXELS: z.coerce
      .number()
      .int()
      .min(1024)
      .max(1000000)
      .default(4096),
    LSB_MIN_EXPECTED_COUNT: z.coerce.number().int().min(5).max(100).default(5),
    LSB_MIN_PAIRS: z.coerce.number().int().min(8).max(128).default(32),
    LSB_MIN_COVERAGE: z.coerce.number().min(0.5).max(1).default(0.8),
  })
  .refine(
    (value) => value.LSB_CLEAR_THRESHOLD < value.LSB_SUSPICIOUS_THRESHOLD,
    {
      path: ['LSB_CLEAR_THRESHOLD'],
      message:
        'The clear threshold must be lower than the suspicious threshold',
    },
  );

export type LsbConfiguration = z.infer<typeof schema>;

export function validateLsbConfiguration(
  values: Record<string, unknown>,
): LsbConfiguration {
  const result = schema.safeParse(values);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid LSB configuration: ${fields.join(', ')}`);
  }
  return result.data;
}
