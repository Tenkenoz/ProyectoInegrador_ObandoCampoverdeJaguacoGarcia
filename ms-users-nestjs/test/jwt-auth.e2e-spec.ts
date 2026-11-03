import {
  Controller,
  Get,
  Req,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth/jwt-auth.guard.js';
import { JwtKeyService } from '../src/auth/jwt-keys/jwt-key.service.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy/jwt.strategy.js';
import { UsersService } from '../src/users/users.service.js';

const userId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const issuer = 'secure-chat-auth';
const audience = 'secure-chat-api';

@Controller('protected')
class ProtectedController {
  @UseGuards(JwtAuthGuard)
  @Get()
  getCurrentUser(
    @Req()
    request: {
      user?: unknown;
    },
  ) {
    return request.user;
  }
}

describe('JWT authentication', () => {
  let app: INestApplication;
  let directory: string;
  let jwtKeys: JwtKeyService;
  let jwtService: JwtService;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'auth-jwt-e2e-'));
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
      JWT_KEY_ID: 'jwt-auth-e2e-key',
      JWT_ISSUER: issuer,
      JWT_AUDIENCE: audience,
    };

    const configService = {
      get: (key: string) =>
        key === 'JWT_CLOCK_TOLERANCE_SECONDS' ? 5 : undefined,
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
        issuer,
        audience,
        keyid: jwtKeys.getKeyId(),
      },
    });

    const usersService = {
      findActiveWithRoles: vi.fn().mockResolvedValue({
        id: userId,
        username: 'admin',
        email: 'admin@example.com',
        tokenVersion: 0,
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
    } as unknown as UsersService;

    const moduleReference = await Test.createTestingModule({
      imports: [
        PassportModule.register({
          defaultStrategy: 'jwt',
          session: false,
        }),
      ],
      controllers: [ProtectedController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        {
          provide: JwtKeyService,
          useValue: jwtKeys,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    }).compile();

    app = moduleReference.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function accessPayload() {
    return {
      sub: userId,
      username: 'admin',
      tokenVersion: 0,
      typ: 'access',
    };
  }

  it('accepts a valid RS256 access token', async () => {
    const token = await jwtService.signAsync(accessPayload());

    const response = await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      userId,
      username: 'admin',
      email: 'admin@example.com',
      roles: ['ADMIN'],
    });
  });

  it('rejects a token signed with HS256', async () => {
    const hs256Service = new JwtService({
      secret: 'a'.repeat(32),
    });
    const token = await hs256Service.signAsync(accessPayload(), {
      algorithm: 'HS256',
      expiresIn: 900,
      issuer,
      audience,
    });

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a token with the wrong issuer or audience', async () => {
    const wrongIssuerToken = await jwtService.signAsync(accessPayload(), {
      issuer: 'other-issuer',
    });
    const wrongAudienceToken = await jwtService.signAsync(accessPayload(), {
      audience: 'other-audience',
    });

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${wrongIssuerToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${wrongAudienceToken}`)
      .expect(401);
  });

  it('rejects an expired token beyond the clock tolerance', async () => {
    const token = await jwtService.signAsync(accessPayload(), {
      expiresIn: -60,
    });

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a token whose typ is not access', async () => {
    const token = await jwtService.signAsync({
      ...accessPayload(),
      typ: 'refresh',
    });

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects a token signed by another key', async () => {
    const { privateKey: otherPrivateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const otherJwtService = new JwtService({
      privateKey: otherPrivateKey,
      signOptions: {
        algorithm: 'RS256',
        expiresIn: 900,
        issuer,
        audience,
        keyid: jwtKeys.getKeyId(),
      },
    });
    const token = await otherJwtService.signAsync(accessPayload());

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
