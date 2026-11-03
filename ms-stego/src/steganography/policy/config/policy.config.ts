import { z } from 'zod';

export const POLICY_CONFIG = Symbol('POLICY_CONFIG');
const schema = z.object({
  POLICY_SUSPICIOUS_ACTION: z
    .enum(['advertencia', 'cuarentena', 'rechazo'])
    .default('cuarentena'),
  POLICY_INCONCLUSIVE_ACTION: z
    .enum(['advertencia', 'cuarentena', 'rechazo'])
    .default('advertencia'),
});
export type PolicyConfiguration = z.infer<typeof schema>;

export function validatePolicyConfiguration(
  values: Record<string, unknown>,
): PolicyConfiguration {
  const result = schema.safeParse(values);
  if (!result.success) throw new Error('Invalid image policy configuration');
  return result.data;
}
