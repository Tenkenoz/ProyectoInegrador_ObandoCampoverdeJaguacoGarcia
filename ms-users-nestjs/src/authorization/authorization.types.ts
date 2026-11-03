export const AUTHORIZATION_ACTIONS = [
  'steganography.analyze',
  'steganography.results.read',
] as const;

export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number];

export type AuthorizationScope = 'own' | 'any';

export type AuthorizationReason =
  'active_role_grants_permission' | 'insufficient_permissions';

export interface AuthorizationDecision {
  allowed: boolean;
  scope: AuthorizationScope | null;
  reason: AuthorizationReason;
}

export function isAuthorizationAction(
  value: unknown,
): value is AuthorizationAction {
  return (
    typeof value === 'string' &&
    (AUTHORIZATION_ACTIONS as readonly string[]).includes(value)
  );
}
