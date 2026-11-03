import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import { PUBLIC_ROUTE } from '../decorators/public.decorator.js';
import {
  AUTHORIZATION_REQUIREMENT,
  type AuthorizationRequirement,
} from '../decorators/require-authorization.decorator.js';
import type { SecurityRequest } from '../interfaces/security-request.js';
import { AuthorizationService } from '../services/authorization.service.js';
import { extractBearerToken } from '../utils/bearer-token.js';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets))
      return true;
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    if (!request.subject)
      throw new UnauthorizedException('A valid access session is required');
    const requirement =
      this.reflector.getAllAndOverride<AuthorizationRequirement>(
        AUTHORIZATION_REQUIREMENT,
        targets,
      );
    if (!requirement)
      throw new ForbiddenException('No authorization policy is configured');
    let resourceId: string | null = null;
    if (requirement.action === 'steganography.results.read') {
      const parsed = z
        .uuid()
        .safeParse(
          requirement.resourceParameter
            ? request.params[requirement.resourceParameter]
            : undefined,
        );
      if (!parsed.success)
        throw new BadRequestException(
          'A valid resource identifier is required',
        );
      resourceId = parsed.data;
    } else if (
      requirement.action !== 'steganography.analyze' ||
      requirement.resourceParameter
    ) {
      throw new ForbiddenException(
        'No valid authorization policy is configured',
      );
    }
    request.authorizationGrant = await this.authorization.authorize(
      extractBearerToken(request.headers.authorization, request.rawHeaders),
      request.subject,
      requirement.action,
      resourceId,
    );
    return true;
  }
}
