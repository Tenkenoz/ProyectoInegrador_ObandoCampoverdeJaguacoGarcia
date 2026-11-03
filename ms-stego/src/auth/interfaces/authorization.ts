export type AuthorizationAction =
  'steganography.analyze' | 'steganography.results.read';
export type AuthorizationScope = 'own' | 'any';

export interface AuthorizationRequest {
  subject_token: string;
  action: AuthorizationAction;
  resource_id: string | null;
}

export interface AuthorizationGrant {
  subject_id: string;
  action: AuthorizationAction;
  resource_id: string | null;
  allowed: true;
  scope: AuthorizationScope;
  reason: 'active_role_grants_permission';
}
