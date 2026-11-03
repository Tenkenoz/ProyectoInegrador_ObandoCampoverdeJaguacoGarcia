import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { JwtPayload } from './interfaces/jwt-payload/jwt-payload.interface.js';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(
    private readonly usersService: UsersService,

    private readonly jwtService: JwtService,

    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    /*
     * Dummy hash used to reduce
     * timing differences between:
     *
     * a missing user
     * and an invalid password.
     */
    this.dummyHash = await argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findForAuthentication(dto.identifier);

    /*
     * Even when the user does not exist,
     * argon2.verify() is executed against
     * a dummy hash.
     */
    const hash = user?.passwordHash ?? this.dummyHash;

    const validPassword = await argon2.verify(hash, dto.password);

    if (!user || !validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    /*
     * IMPORTANT:
     *
     * The JWT only identifies
     * the user.
     *
     * It does NOT store roles.
     */
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      tokenVersion: user.tokenVersion,
      typ: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    /*
     * The roles returned to the client
     * also come from PostgreSQL.
     */
    const currentUser = await this.usersService.findActiveWithRoles(user.id);

    const roles =
      currentUser?.userRoles

        ?.filter((userRole) => userRole.estado && userRole.role?.estado)

        .map((userRole) => userRole.role.rol) ?? [];

    return {
      accessToken,

      tokenType: 'Bearer',

      expiresIn:
        this.configService.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 900,

      user: {
        id: user.id,

        username: user.username,

        email: user.email,

        roles: [...new Set(roles)],
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.incrementTokenVersion(userId);
  }
}
