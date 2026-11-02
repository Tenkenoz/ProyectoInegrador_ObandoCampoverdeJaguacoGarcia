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
     * Roles requeridos por
     * Controller/endpoint.
     */
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    /*
     * Si el endpoint no exige
     * ningún rol específico,
     * basta estar autenticado.
     */
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    /*
     * request.user fue creado
     * por JwtStrategy usando
     * roles provenientes de BD.
     */
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso no autorizado');
    }

    const currentRoles = new Set(user.roles.map((role) => role.toUpperCase()));

    const authorized = requiredRoles.some((requiredRole) =>
      currentRoles.has(requiredRole.toUpperCase()),
    );

    if (!authorized) {
      throw new ForbiddenException('No posee los roles requeridos');
    }

    return true;
  }
}
