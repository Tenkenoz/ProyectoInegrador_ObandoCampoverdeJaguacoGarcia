import { z } from 'zod';

const probability = z.number().min(0).max(1);

export const lsbIndicatorsSchema = z.object({
  chi_square: z.number().nonnegative().nullable(),
  degrees_of_freedom: z.number().int().min(0).max(384),
  p_value: probability.nullable(),
  anomaly_score: probability.nullable(),
  lsb_ratio: probability.nullable(),
  threshold: probability,
  clear_threshold: probability,
  balance_tolerance: probability,
  pixel_count: z.number().int().nonnegative(),
  sample_count: z.number().int().nonnegative(),
  coverage: probability,
});

export const lsbResultSchema = z.object({
  technique: z.literal('lsb_chi_square_v1'),
  status: z.enum(['sin_indicios', 'sospechoso', 'no_concluyente', 'error']),
  reason: z.enum([
    'pair_balance_compatible',
    'pair_balance_rejected',
    'insufficient_samples',
    'insufficient_pair_coverage',
    'ambiguous_evidence',
    'invalid_pixel_data',
    'numerical_failure',
  ]),
  indicators: lsbIndicatorsSchema,
  channels: z
    .array(
      z.object({
        channel: z.enum(['red', 'green', 'blue']),
        sample_count: z.number().int().positive(),
        eligible_pairs: z.number().int().min(0).max(128),
        coverage: probability,
        chi_square: z.number().nonnegative(),
        p_value: probability.nullable(),
        lsb_ratio: probability,
      }),
    )
    .max(3),
  limitations: z.array(z.string().min(1).max(250)).min(1).max(10),
});
