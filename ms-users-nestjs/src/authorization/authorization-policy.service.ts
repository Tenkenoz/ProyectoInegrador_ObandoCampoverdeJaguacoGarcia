import { Injectable } from '@nestjs/common';
import {
  ROLE_ADMIN,
  ROLE_ANALYST,
  ROLE_USER,
  type RoleName,
} from '../roles/role.constants.js';
import type {
  AuthorizationAction,
  AuthorizationDecision,
  AuthorizationScope,
} from './authorization.types.js';

const ROLE_GRANTS: Record<
  RoleName,
  Partial<Record<AuthorizationAction, AuthorizationScope>>
> = {
  [ROLE_ADMIN]: {
    'steganography.analyze': 'any',
    'steganography.results.read': 'any',
  },
  [ROLE_ANALYST]: {
    'steganography.analyze': 'own',
    'steganography.results.read': 'own',
  },
  [ROLE_USER]: {},
};

@Injectable()
export class AuthorizationPolicyService {
  evaluate(
    roles: readonly string[],
    action: AuthorizationAction,
  ): AuthorizationDecision {
    const normalizedRoles = new Set(
      roles.map((role) => role.trim().toUpperCase()),
    );

    let ownsPermission = false;

    for (const role of normalizedRoles) {
      const grants = ROLE_GRANTS[role as RoleName];

      if (!grants) {
        continue;
      }

      const scope = grants[action];

      if (scope === 'any') {
        return {
          allowed: true,
          scope: 'any',
          reason: 'active_role_grants_permission',
        };
      }

      if (scope === 'own') {
        ownsPermission = true;
      }
    }

    if (ownsPermission) {
      return {
        allowed: true,
        scope: 'own',
        reason: 'active_role_grants_permission',
      };
    }

    return {
      allowed: false,
      scope: null,
      reason: 'insufficient_permissions',
    };
  }

  allowedActions(roles: readonly string[]): AuthorizationAction[] {
    return (
      Object.keys(ROLE_GRANTS[ROLE_ADMIN]) as AuthorizationAction[]
    ).filter((action) => this.evaluate(roles, action).allowed);
  }
}
