import { AuthorizationPolicyService } from './authorization-policy.service.js';
import type { AuthorizationAction } from './authorization.types.js';

describe('AuthorizationPolicyService', () => {
  const policy = new AuthorizationPolicyService();

  const actions: AuthorizationAction[] = [
    'steganography.analyze',
    'steganography.results.read',
  ];

  it.each(actions)('grants any scope to ADMIN for %s', (action) => {
    expect(policy.evaluate(['ADMIN'], action)).toEqual({
      allowed: true,
      scope: 'any',
      reason: 'active_role_grants_permission',
    });
  });

  it.each(actions)('grants own scope to ANALYST for %s', (action) => {
    expect(policy.evaluate(['ANALYST'], action)).toEqual({
      allowed: true,
      scope: 'own',
      reason: 'active_role_grants_permission',
    });
  });

  it.each(actions)('denies USER for %s', (action) => {
    expect(policy.evaluate(['USER'], action)).toEqual({
      allowed: false,
      scope: null,
      reason: 'insufficient_permissions',
    });
  });

  it('uses the highest available scope when roles accumulate', () => {
    expect(
      policy.evaluate(['ANALYST', 'USER'], 'steganography.analyze'),
    ).toMatchObject({
      allowed: true,
      scope: 'own',
    });

    expect(
      policy.evaluate(['USER', 'ADMIN', 'ANALYST'], 'steganography.analyze'),
    ).toMatchObject({
      allowed: true,
      scope: 'any',
    });
  });

  it('normalizes role casing and ignores unknown roles', () => {
    expect(
      policy.evaluate([' analyst '], 'steganography.analyze'),
    ).toMatchObject({
      allowed: true,
      scope: 'own',
    });

    expect(policy.evaluate(['UNKNOWN'], 'steganography.analyze')).toEqual({
      allowed: false,
      scope: null,
      reason: 'insufficient_permissions',
    });
  });

  it('lists the actions granted to a set of roles', () => {
    expect(policy.allowedActions(['ANALYST'])).toEqual(actions);
    expect(policy.allowedActions(['USER'])).toEqual([]);
  });
});
