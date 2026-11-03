import {
  RequestMethod,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AuthorizationPolicyService } from '../src/authorization/authorization-policy.service.js';
import { INTERNAL_AUTHORIZATION_PATH } from '../src/authorization/authorization.types.js';
import { JwtKeyService } from '../src/auth/jwt-keys/jwt-key.service.js';
import { AccessTokenVerifierService } from '../src/internal/authorization/access-token-verifier.service.js';
import { InternalAuthorizationController } from '../src/internal/authorization/internal-authorization.controller.js';
import { InternalAuthorizationService } from '../src/internal/authorization/internal-authorization.service.js';
import { NonceCacheService } from '../src/internal/service-auth/nonce-cache.service.js';
import { ServiceHmacGuard } from '../src/internal/service-auth/service-hmac.guard.js';
import { ServiceSignatureService } from '../src/internal/service-auth/service-signature.service.js';
import { UsersService } from '../src/users/users.service.js';

const serviceSecret = '22'.repeat(32);
const issuer = 'secure-chat-auth';
const audience = 'secure-chat-api';
const resourceId = '7d444840-9dc0-41d1-b245-5ffdce74fad2';

const adminId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const analystId = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const userId = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const revokedId = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const unknownId = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';

function activeUser(id: string, roles: string[], tokenVersion = 0) {
  return {
    id,
    tokenVersion,
    userRoles: roles.map((rol) => ({
      estado: true,
      role: {
        rol,
        estado: true,
      },
    })),
  };
}

function signBody(
  body: string,
  options: {
    timestamp?: string;
    nonce?: string;
    serviceId?: string;
    secret?: string;
  } = {},
) {
  const timestamp =
    options.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const nonce = options.nonce ?? randomBytes(32).toString('hex');
  const serviceId = options.serviceId ?? 'stego';
  const digest = createHash('sha256').update(body).digest('hex');
  const message = [
    serviceId,
    'POST',
    INTERNAL_AUTHORIZATION_PATH,
    timestamp,
    nonce,
    digest,
  ].join('\n');
  const signature = createHmac(
    'sha256',
    Buffer.from(options.secret ?? serviceSecret, 'hex'),
  )
    .update(message, 'utf8')
    .digest('hex');

  return {
    'X-Service-Id': serviceId,
    'X-Service-Timestamp': timestamp,
    'X-Service-Nonce': nonce,
    'X-Service-Signature': signature,
  };
}

describe('Internal authorization endpoint', () => {
  let app: INestApplication;
  let directory: string;
  let jwtService: JwtService;
  let findActiveWithRoles: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'auth-internal-e2e-'));
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
      JWT_KEY_ID: 'internal-auth-e2e-key',
      JWT_ISSUER: issuer,
      JWT_AUDIENCE: audience,
      AUTH_SERVICE_ID: 'stego',
      AUTH_SERVICE_SECRET: serviceSecret,
    };

    const configService = {
      get: (key: string) => {
        if (key === 'JWT_CLOCK_TOLERANCE_SECONDS') return 5;
        if (key === 'AUTH_HMAC_CLOCK_SKEW_SECONDS') return 30;
        if (key === 'AUTH_HMAC_NONCE_TTL_SECONDS') return 60;
        if (key === 'AUTH_HMAC_NONCE_CACHE_SIZE') return 1000;
        return undefined;
      },
      getOrThrow: (key: string) => {
        const value = configValues[key];

        if (!value) {
          throw new Error(`Missing ${key}`);
        }

        return value;
      },
    } as unknown as ConfigService;

    const jwtKeys = new JwtKeyService(configService);
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

    const users = new Map<string, ReturnType<typeof activeUser>>([
      [adminId, activeUser(adminId, ['ADMIN'])],
      [analystId, activeUser(analystId, ['ANALYST'])],
      [userId, activeUser(userId, ['USER'])],
      [revokedId, activeUser(revokedId, ['ADMIN'], 1)],
    ]);

    findActiveWithRoles = vi.fn((id: string) => users.get(id) ?? null);

    const usersService = {
      findActiveWithRoles,
    } as unknown as UsersService;

    const moduleReference = await Test.createTestingModule({
      controllers: [InternalAuthorizationController],
      providers: [
        JwtService,
        JwtKeyService,
        ConfigService,
        AuthorizationPolicyService,
        AccessTokenVerifierService,
        InternalAuthorizationService,
        NonceCacheService,
        ServiceSignatureService,
        ServiceHmacGuard,
        {
          provide: UsersService,
          useValue: usersService,
        },
      ],
    })
      .overrideProvider(JwtService)
      .useValue(jwtService)
      .overrideProvider(JwtKeyService)
      .useValue(jwtKeys)
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();

    app = moduleReference.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api', {
      exclude: [
        {
          path: 'internal/authorization/check',
          method: RequestMethod.POST,
        },
      ],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function tokenFor(id: string, tokenVersion = 0): Promise<string> {
    return jwtService.signAsync({
      sub: id,
      username: 'user',
      tokenVersion,
      typ: 'access',
    });
  }

  function post(body: string, headers: Record<string, string>) {
    return request(app.getHttpServer())
      .post(INTERNAL_AUTHORIZATION_PATH)
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);
  }

  it('is not exposed under the versioned API prefix', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/internal/authorization/check')
      .expect(404);
  });

  it('rejects missing or invalid service credentials', async () => {
    const body = JSON.stringify({
      subject_token: 'token',
      action: 'steganography.analyze',
      resource_id: null,
    });

    const missing = await request(app.getHttpServer())
      .post(INTERNAL_AUTHORIZATION_PATH)
      .send(body);
    const invalid = await post(body, {
      ...signBody(body),
      'X-Service-Signature': '0'.repeat(64),
    });
    const tampered = await post(body.replace('analyze', 'results.read'), {
      ...signBody(body),
    });

    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({
      code: 'invalid_service_credentials',
      message: 'Invalid service credentials',
    });
    expect(invalid.status).toBe(401);
    expect(tampered.status).toBe(401);
  });

  it('rejects expired timestamps and replayed nonces', async () => {
    const body = JSON.stringify({
      subject_token: await tokenFor(adminId),
      action: 'steganography.analyze',
      resource_id: null,
    });
    const expiredHeaders = signBody(body, {
      timestamp: (Math.floor(Date.now() / 1000) - 31).toString(),
    });
    const replayHeaders = signBody(body);

    const expired = await post(body, expiredHeaders);
    const firstReplay = await post(body, replayHeaders);
    const secondReplay = await post(body, replayHeaders);

    expect(expired.status).toBe(401);
    expect(firstReplay.status).toBe(200);
    expect(secondReplay.status).toBe(401);
    expect(secondReplay.body.code).toBe('invalid_service_credentials');
  });

  it('returns an allow decision for ADMIN with any scope', async () => {
    const body = JSON.stringify({
      subject_token: await tokenFor(adminId),
      action: 'steganography.analyze',
      resource_id: null,
    });

    const response = await post(body, signBody(body));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subject_id: adminId,
      action: 'steganography.analyze',
      resource_id: null,
      allowed: true,
      scope: 'any',
      reason: 'active_role_grants_permission',
    });
  });

  it('returns an own-scope decision for ANALYST results', async () => {
    const body = JSON.stringify({
      subject_token: await tokenFor(analystId),
      action: 'steganography.results.read',
      resource_id: resourceId,
    });

    const response = await post(body, signBody(body));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subject_id: analystId,
      action: 'steganography.results.read',
      resource_id: resourceId,
      allowed: true,
      scope: 'own',
      reason: 'active_role_grants_permission',
    });
  });

  it('denies USER without failing the request', async () => {
    const body = JSON.stringify({
      subject_token: await tokenFor(userId),
      action: 'steganography.analyze',
      resource_id: null,
    });

    const response = await post(body, signBody(body));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      subject_id: userId,
      action: 'steganography.analyze',
      resource_id: null,
      allowed: false,
      scope: null,
      reason: 'insufficient_permissions',
    });
  });

  it('returns stable codes for inactive users and revoked sessions', async () => {
    const inactiveBody = JSON.stringify({
      subject_token: await tokenFor(unknownId),
      action: 'steganography.analyze',
      resource_id: null,
    });
    const revokedBody = JSON.stringify({
      subject_token: await tokenFor(revokedId),
      action: 'steganography.analyze',
      resource_id: null,
    });

    const inactive = await post(inactiveBody, signBody(inactiveBody));
    const revoked = await post(revokedBody, signBody(revokedBody));

    expect(inactive.status).toBe(401);
    expect(inactive.body).toEqual({
      code: 'subject_inactive',
      message: 'Subject is not active',
    });
    expect(revoked.status).toBe(401);
    expect(revoked.body).toEqual({
      code: 'session_revoked',
      message: 'Subject session is no longer valid',
    });
  });

  it('rejects invalid subject tokens and invalid resource combinations', async () => {
    const invalidTokenBody = JSON.stringify({
      subject_token: 'not-a-token',
      action: 'steganography.analyze',
      resource_id: null,
    });
    const invalidResourceBody = JSON.stringify({
      subject_token: await tokenFor(adminId),
      action: 'steganography.analyze',
      resource_id: resourceId,
    });
    const invalidActionBody = JSON.stringify({
      subject_token: await tokenFor(adminId),
      action: 'unknown.action',
      resource_id: null,
    });

    const invalidToken = await post(
      invalidTokenBody,
      signBody(invalidTokenBody),
    );
    const invalidResource = await post(
      invalidResourceBody,
      signBody(invalidResourceBody),
    );
    const invalidAction = await post(
      invalidActionBody,
      signBody(invalidActionBody),
    );

    expect(invalidToken.status).toBe(401);
    expect(invalidToken.body.code).toBe('invalid_subject_token');
    expect(invalidResource.status).toBe(400);
    expect(invalidResource.body.code).toBe('invalid_authorization_request');
    expect(invalidAction.status).toBe(400);
    expect(invalidAction.body.code).toBe('invalid_authorization_request');
  });
});
