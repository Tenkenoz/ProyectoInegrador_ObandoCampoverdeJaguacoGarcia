import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../decorators/roles/roles.decorator.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /*
     * Roles required by the
     * controller or endpoint.
     */
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    /*
     * If the endpoint does not require
     * a specific role, authentication
     * is enough.
     */
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    /*
     * request.user is created by
     * JwtStrategy using roles loaded
     * from the database.
     */
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    const currentRoles = new Set(user.roles.map((role) => role.toUpperCase()));

    const authorized = requiredRoles.some((requiredRole) =>
      currentRoles.has(requiredRole.toUpperCase()),
    );

    if (!authorized) {
      throw new ForbiddenException('Missing required roles');
    }

    return true;
  }
}
