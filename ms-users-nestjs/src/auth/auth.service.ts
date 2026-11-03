import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasher } from '../common/security/password-hasher.service.js';
import { User } from '../users/entities/user.entity.js';
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

    private readonly passwordHasher: PasswordHasher,

    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    /*
     * Dummy hash used to reduce timing differences between a missing user and
     * an invalid password.
     */
    this.dummyHash = await this.passwordHasher.hash(
      randomBytes(32).toString('hex'),
    );
  }

  async login(dto: LoginDto, requestId?: string) {
    const user = await this.usersService.findForAuthentication(dto.identifier);

    /*
     * Even when the user does not exist, verification is executed against a
     * dummy hash.
     */
    const hash = user?.passwordHash ?? this.dummyHash;
    const validPassword = await this.passwordHasher.verify(hash, dto.password);

    if (!user || !validPassword) {
      await this.auditService.record({
        eventType: 'auth.login.failed',
        actorId: null,
        subjectId: user?.id ?? null,
        action: 'auth.login',
        decision: 'failed',
        reason: 'invalid_credentials',
        requestId: requestId ?? null,
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    /*
     * The JWT only identifies the user. It does NOT store roles.
     */
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      tokenVersion: user.tokenVersion,
      typ: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const currentUser = await this.usersService.findActiveWithRoles(user.id);

    await this.auditService.record({
      eventType: 'auth.login.succeeded',
      actorId: user.id,
      subjectId: user.id,
      action: 'auth.login',
      decision: 'succeeded',
      reason: 'authenticated',
      requestId: requestId ?? null,
    });

    return {
      accessToken,

      tokenType: 'Bearer',

      expiresIn:
        this.configService.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 900,

      user: {
        id: user.id,

        username: user.username,

        email: user.email,

        roles: currentUser ? this.getActiveRoles(currentUser) : [],
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findActiveWithRoles(userId);

    if (!user) {
      throw new UnauthorizedException('User is not authorized');
    }

    return {
      id: user.id,
      cedula: user.cedula,
      nombres: user.nombres,
      apellidos: user.apellidos,
      fechaNacimiento: user.fechaNacimiento,
      username: user.username,
      email: user.email,
      telefono: user.telefono,
      estado: user.estado,
      roles: this.getActiveRoles(user),
    };
  }

  async logout(userId: string, requestId?: string): Promise<void> {
    await this.usersService.incrementTokenVersion(userId);

    await this.auditService.record({
      eventType: 'auth.logout',
      actorId: userId,
      subjectId: userId,
      action: 'auth.logout',
      decision: 'succeeded',
      reason: 'token_version_incremented',
      requestId: requestId ?? null,
    });
  }

  private getActiveRoles(user: User): string[] {
    const roles =
      user.userRoles
        ?.filter((userRole) => userRole.estado && userRole.role?.estado)
        .map((userRole) => userRole.role.rol) ?? [];

    return [...new Set(roles)].sort();
  }
}
