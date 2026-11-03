import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsersService } from '../../../users/users.service.js';
import type { JwtKeyService } from '../../jwt-keys/jwt-key.service.js';
import type { JwtPayload } from '../../interfaces/jwt-payload/jwt-payload.interface.js';
import { JwtStrategy } from './jwt.strategy.js';

const userId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('JwtStrategy', () => {
  const configService = {
    get: (key: string) =>
      key === 'JWT_CLOCK_TOLERANCE_SECONDS' ? 5 : undefined,
    getOrThrow: (key: string) => {
      if (key === 'JWT_ISSUER') return 'secure-chat-auth';
      if (key === 'JWT_AUDIENCE') return 'secure-chat-api';
      return 'value';
    },
  } as unknown as ConfigService;

  const jwtKeyService = {
    getPublicKeyPem: () =>
      '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
  } as unknown as JwtKeyService;

  function createStrategy(user: unknown): JwtStrategy {
    const usersService = {
      findActiveWithRoles: vi.fn().mockResolvedValue(user),
    } as unknown as UsersService;

    return new JwtStrategy(configService, jwtKeyService, usersService);
  }

  const payload: JwtPayload = {
    sub: userId,
    username: 'admin',
    tokenVersion: 0,
    typ: 'access',
  };

  it('returns the active roles loaded from the database', async () => {
    const strategy = createStrategy({
      id: userId,
      username: 'admin',
      email: 'admin@example.com',
      tokenVersion: 0,
      userRoles: [
        {
          estado: true,
          role: {
            rol: 'ANALYST',
            estado: true,
          },
        },
      ],
    });

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId,
      username: 'admin',
      email: 'admin@example.com',
      roles: ['ANALYST'],
    });
  });

  it('rejects tokens whose typ is not access', async () => {
    const strategy = createStrategy(null);

    await expect(
      strategy.validate({
        ...payload,
        typ: 'refresh' as 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive users and revoked sessions', async () => {
    const strategy = createStrategy(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const revokedStrategy = createStrategy({
      id: userId,
      username: 'admin',
      email: 'admin@example.com',
      tokenVersion: 1,
      userRoles: [],
    });

    await expect(revokedStrategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
