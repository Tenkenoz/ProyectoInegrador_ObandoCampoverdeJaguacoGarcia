import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createPublicKey,
  generateKeyPairSync,
  type JsonWebKey,
} from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasher } from '../common/security/password-hasher.service.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { JwtKeyService } from './jwt-keys/jwt-key.service.js';

describe('AuthService', () => {
  const userId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const password = 'ValidPassword123!';

  let directory: string;
  let jwtKeys: JwtKeyService;
  let jwtService: JwtService;
  let authService: AuthService;
  let usersService: UsersService;
  let incrementTokenVersion: ReturnType<typeof vi.fn>;
  let recordAudit: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'auth-service-jwt-'));
    const privateKeyPath = join(directory, 'jwt-private.pem');
    const publicKeyPath = join(directory, 'jwt-public.pem');

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    writeFileSync(publicKeyPath, publicKey);

    const configValues: Record<string, string> = {
      JWT_PRIVATE_KEY_PATH: privateKeyPath,
      JWT_PUBLIC_KEY_PATH: publicKeyPath,
      JWT_KEY_ID: 'auth-service-test-key',
      JWT_ISSUER: 'secure-chat-auth',
      JWT_AUDIENCE: 'secure-chat-api',
    };

    const configService = {
      get: (key: string) =>
        key === 'JWT_EXPIRES_IN_SECONDS' ? 900 : configValues[key],
      getOrThrow: (key: string) => {
        const value = configValues[key];

        if (!value) {
          throw new Error(`Missing ${key}`);
        }

        return value;
      },
    } as unknown as ConfigService;

    jwtKeys = new JwtKeyService(configService);
    jwtService = new JwtService({
      privateKey: jwtKeys.getPrivateKeyPem(),
      signOptions: {
        algorithm: 'RS256',
        expiresIn: 900,
        issuer: 'secure-chat-auth',
        audience: 'secure-chat-api',
        keyid: jwtKeys.getKeyId(),
      },
    });

    const passwordHasher = new PasswordHasher();
    const passwordHash = await passwordHasher.hash(password);

    const user = {
      id: userId,
      cedula: '1712345678',
      nombres: 'Admin',
      apellidos: 'User',
      fechaNacimiento: '1990-01-01',
      username: 'admin',
      email: 'admin@example.com',
      telefono: '0999999999',
      estado: true,
      tokenVersion: 0,
      passwordHash,
    };

    incrementTokenVersion = vi.fn();
    recordAudit = vi.fn().mockResolvedValue(undefined);

    const auditService = {
      record: recordAudit,
    } as unknown as AuditService;

    usersService = {
      findForAuthentication: vi.fn().mockResolvedValue(user),
      findActiveWithRoles: vi.fn().mockResolvedValue({
        ...user,
        userRoles: [
          {
            estado: true,
            role: {
              rol: 'ADMIN',
              estado: true,
            },
          },
        ],
      }),
      incrementTokenVersion,
    } as unknown as UsersService;

    authService = new AuthService(
      usersService,
      jwtService,
      configService,
      passwordHasher,
      auditService,
    );
    await authService.onModuleInit();
  });

  beforeEach(() => {
    recordAudit.mockClear();
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('returns an RS256 token with a kid and JWKS-verifiable signature', async () => {
    const result = await authService.login({
      identifier: 'admin',
      password,
    });

    const decoded = jwtService.decode(result.accessToken, {
      complete: true,
    }) as {
      header: Record<string, unknown>;
      payload: Record<string, unknown>;
    };

    expect(decoded.header.alg).toBe('RS256');
    expect(decoded.header.kid).toBe(jwtKeys.getKeyId());
    expect(decoded.payload).toMatchObject({
      sub: userId,
      typ: 'access',
      tokenVersion: 0,
      iss: 'secure-chat-auth',
      aud: 'secure-chat-api',
    });

    const jwk = jwtKeys.getJwks().keys[0] as JsonWebKey;
    const publicKey = createPublicKey({
      key: jwk,
      format: 'jwk',
    }).export({
      type: 'spki',
      format: 'pem',
    });

    await expect(
      jwtService.verifyAsync(result.accessToken, {
        publicKey,
        algorithms: ['RS256'],
        issuer: 'secure-chat-auth',
        audience: 'secure-chat-api',
      }),
    ).resolves.toMatchObject({
      sub: userId,
      typ: 'access',
    });

    expect(result).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: userId,
        username: 'admin',
        roles: ['ADMIN'],
      },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'auth.login.succeeded',
        actorId: userId,
        subjectId: userId,
        action: 'auth.login',
        decision: 'succeeded',
      }),
    );
  });

  it('returns the authenticated profile with current roles', async () => {
    await expect(authService.getProfile(userId)).resolves.toEqual({
      id: userId,
      cedula: '1712345678',
      nombres: 'Admin',
      apellidos: 'User',
      fechaNacimiento: '1990-01-01',
      username: 'admin',
      email: 'admin@example.com',
      telefono: '0999999999',
      estado: true,
      roles: ['ADMIN'],
    });
  });

  it('rejects an invalid password and audits the failure', async () => {
    await expect(
      authService.login({
        identifier: 'admin',
        password: 'WrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'auth.login.failed',
        subjectId: userId,
        action: 'auth.login',
        decision: 'failed',
        reason: 'invalid_credentials',
      }),
    );
    expect(JSON.stringify(recordAudit.mock.calls)).not.toContain(
      'WrongPassword123!',
    );
  });

  it('increments tokenVersion and audits logout', async () => {
    await authService.logout(userId, 'request-1');

    expect(incrementTokenVersion).toHaveBeenCalledWith(userId);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'auth.logout',
        actorId: userId,
        subjectId: userId,
        action: 'auth.logout',
        decision: 'succeeded',
        requestId: 'request-1',
      }),
    );
  });
});
