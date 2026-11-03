import { Injectable, UnauthorizedException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../interfaces/jwt-payload/jwt-payload.interface.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';
import { UsersService } from '../../../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,

    private readonly usersService: UsersService,
  ) {
    super({
      /*
       * Authorization:
       * Bearer eyJ...
       */
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),

      issuer: configService.getOrThrow<string>('JWT_ISSUER'),

      audience: configService.getOrThrow<string>('JWT_AUDIENCE'),

      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    /*
     * Only access tokens are
     * accepted.
     */
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token');
    }

    /*
     * Query PostgreSQL.
     *
     * The following relation is loaded:
     *
     * users
     *   ↓
     * user_roles
     *   ↓
     * roles
     */
    const user = await this.usersService.findActiveWithRoles(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User is not authorized');
    }

    /*
     * Session revocation check.
     *
     * Previous JWT:
     * tokenVersion = 0
     *
     * PostgreSQL after logout:
     * tokenVersion = 1
     */
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Session has expired');
    }

    /*
     * Roles are NOT read from the JWT.
     *
     * They are read from:
     *
     * user_roles
     *     ↓
     * roles
     */
    const roles =
      user.userRoles
        ?.filter(
          (userRole) =>
            userRole.estado &&
            userRole.role !== undefined &&
            userRole.role !== null &&
            userRole.role.estado,
        )

        .map((userRole) => userRole.role.rol) ?? [];

    return {
      userId: user.id,

      username: user.username,

      email: user.email,

      roles: [...new Set(roles)],
    };
  }
}
