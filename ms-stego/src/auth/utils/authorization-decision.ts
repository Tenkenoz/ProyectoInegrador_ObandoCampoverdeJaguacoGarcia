import { z } from 'zod';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import type { AuthorizationAction } from '../interfaces/authorization.js';

const common = z.object({
  subject_id: z.uuid(),
  action: z.enum(['steganography.analyze', 'steganography.results.read']),
  resource_id: z.uuid().nullable(),
});

const schema = z.discriminatedUnion('allowed', [
  common.extend({
    allowed: z.literal(true),
    scope: z.enum(['own', 'any']),
    reason: z.literal('active_role_grants_permission'),
  }),
  common.extend({
    allowed: z.literal(false),
    scope: z.null(),
    reason: z.literal('insufficient_permissions'),
  }),
]);

export function parseAuthorizationDecision(
  value: unknown,
  subjectId: string,
  action: AuthorizationAction,
  resourceId: string | null,
) {
  const result = schema.safeParse(value);
  if (
    !result.success ||
    result.data.subject_id !== subjectId ||
    result.data.action !== action ||
    result.data.resource_id !== resourceId
  ) {
    throw new AuthDependencyError();
  }
  return result.data;
}
