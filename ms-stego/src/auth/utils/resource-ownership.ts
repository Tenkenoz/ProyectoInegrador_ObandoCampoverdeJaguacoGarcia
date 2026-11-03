import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationGrant } from '../interfaces/authorization.js';

export function assertResourceOwnership(
  grant: AuthorizationGrant,
  ownerId: string,
): void {
  if (grant.scope !== 'any' && grant.subject_id !== ownerId) {
    throw new ForbiddenException('Access to this resource is forbidden');
  }
}
