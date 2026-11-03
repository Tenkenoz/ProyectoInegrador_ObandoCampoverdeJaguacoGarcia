import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthorizationAction } from '../interfaces/authorization.js';

export const AUTHORIZATION_REQUIREMENT = Symbol('AUTHORIZATION_REQUIREMENT');

export interface AuthorizationRequirement {
  action: AuthorizationAction;
  resourceParameter?: string;
}

export function RequireAuthorization(
  action: AuthorizationAction,
  resourceParameter?: string,
) {
  return applyDecorators(
    SetMetadata(AUTHORIZATION_REQUIREMENT, {
      action,
      resourceParameter,
    } satisfies AuthorizationRequirement),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: 'A valid access session is required.',
    }),
    ApiForbiddenResponse({
      description: 'The requested operation is forbidden.',
    }),
    ApiServiceUnavailableResponse({
      description: 'Current authorization could not be verified.',
    }),
  );
}
