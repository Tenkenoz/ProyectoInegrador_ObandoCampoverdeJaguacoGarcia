import {
  Controller,
  Get,
  Injectable,
  Logger,
  Post,
  Req,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type INestApplication,
  type NestInterceptor,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { AUTH_CONFIG } from '../src/auth/config/auth.config.js';
import { RequireAuthorization } from '../src/auth/decorators/require-authorization.decorator.js';
import type { SecurityRequest } from '../src/auth/interfaces/security-request.js';
import { assertResourceOwnership } from '../src/auth/utils/resource-ownership.js';
import { AppController } from '../src/app.controller.js';
import { AppService } from '../src/app.service.js';
import { setupApp } from '../src/setup-app.js';
import { createAuthFixture } from './helpers/auth-fixture.js';

const processing = vi.fn();
let resultOwner: string;

@Injectable()
class ProcessingProbe implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    processing();
    return next.handle();
  }
}

@Controller('security-test')
class ProtectedTestController {
  @Post('analyze')
  @RequireAuthorization('steganography.analyze')
  @UseInterceptors(ProcessingProbe, FileInterceptor('file'))
  analyze(@Req() req: SecurityRequest) {
    return {
      userId: req.subject!.userId,
      scope: req.authorizationGrant!.scope,
    };
  }

  @Get('results/:id')
  @RequireAuthorization('steganography.results.read', 'id')
  result(@Req() req: SecurityRequest) {
    assertResourceOwnership(req.authorizationGrant!, resultOwner);
    return { id: req.authorizationGrant!.resource_id };
  }

  @Get('unconfigured')
  unconfigured() {
    return { exposed: true };
  }
}

describe('Security boundary with an HTTPS AUTH fixture', () => {
  let fixture: Awaited<ReturnType<typeof createAuthFixture>>;
  let app: INestApplication;

  beforeAll(async () => {
    fixture = await createAuthFixture();
  });
  beforeEach(async () => {
    fixture.state.mode = 'allow';
    fixture.state.scope = 'own';
    fixture.state.jwksUnavailable = false;
    fixture.state.jwksRequests = 0;
    fixture.state.authorizationRequests = 0;
    fixture.state.validSignatures = 0;
    resultOwner = fixture.signing.userId;
    processing.mockClear();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const module = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedTestController, AppController],
      providers: [
        ProcessingProbe,
        { provide: AppService, useValue: { health: () => ({ status: 'ok' }) } },
      ],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(fixture.config)
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await fixture.dispose();
  });

  it('keeps health and Swagger public', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await request(app.getHttpServer()).get('/docs').expect(200);
    expect(fixture.state.jwksRequests).toBe(0);
  });

  it('rejects missing or malformed tokens before multipart processing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .attach('file', Buffer.from('image'), 'image.png')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', 'Bearer malformed')
      .expect(401);
    expect(processing).not.toHaveBeenCalled();
    expect(fixture.state.authorizationRequests).toBe(0);
  });

  it('rejects expired and manipulated tokens before contacting authorization', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await fixture.signing.issue({
      iat: now - 1500,
      exp: now - 600,
    });
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    const token = await fixture.signing.issue();
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload}.${signature![0] === 'A' ? 'B' : 'A'}${signature!.slice(1)}`;
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
    expect(processing).not.toHaveBeenCalled();
    expect(fixture.state.authorizationRequests).toBe(0);
  });

  it('signs each authorization request and reuses only public keys', async () => {
    const token = await fixture.signing.issue();
    for (let index = 0; index < 2; index++) {
      await request(app.getHttpServer())
        .post('/api/v1/security-test/analyze')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('image'), 'image.png')
        .expect(201);
    }
    expect(fixture.state.validSignatures).toBe(2);
    expect(fixture.state.authorizationRequests).toBe(2);
    expect(fixture.state.jwksRequests).toBe(1);
    expect(processing).toHaveBeenCalledTimes(2);
  });

  it('denies insufficient permissions despite client-supplied roles', async () => {
    fixture.state.mode = 'deny';
    const token = await fixture.signing.issue({ roles: ['ADMIN'] });
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Roles', 'ADMIN')
      .attach('file', Buffer.from('image'), 'image.png')
      .expect(403);
    expect(processing).not.toHaveBeenCalled();
  });

  it('denies the next operation after role revocation with the same token', async () => {
    const token = await fixture.signing.issue();
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    fixture.state.mode = 'deny';
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(processing).toHaveBeenCalledTimes(1);
    expect(fixture.state.authorizationRequests).toBe(2);
  });

  it('rejects a session invalidated by logout', async () => {
    fixture.state.mode = 'session_revoked';
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${await fixture.signing.issue()}`)
      .expect(401);
    expect(processing).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'invalid_service', 'mismatch', 'timeout'] as const)(
    'fails closed when AUTH returns %s',
    async (mode) => {
      fixture.state.mode = mode;
      await request(app.getHttpServer())
        .post('/api/v1/security-test/analyze')
        .set('Authorization', `Bearer ${await fixture.signing.issue()}`)
        .attach('file', Buffer.from('image'), 'image.png')
        .expect(503);
      expect(processing).not.toHaveBeenCalled();
      expect(fixture.state.authorizationRequests).toBe(1);
    },
  );

  it('fails closed when public keys cannot be obtained', async () => {
    fixture.state.jwksUnavailable = true;
    await request(app.getHttpServer())
      .post('/api/v1/security-test/analyze')
      .set('Authorization', `Bearer ${await fixture.signing.issue()}`)
      .expect(503);
    expect(processing).not.toHaveBeenCalled();
    expect(fixture.state.authorizationRequests).toBe(0);
  });

  it('enforces ownership and permits the ADMIN scope', async () => {
    const id = randomUUID();
    const token = await fixture.signing.issue();
    await request(app.getHttpServer())
      .get(`/api/v1/security-test/results/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    resultOwner = randomUUID();
    await request(app.getHttpServer())
      .get(`/api/v1/security-test/results/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    fixture.state.scope = 'any';
    await request(app.getHttpServer())
      .get(`/api/v1/security-test/results/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects routes without an authorization policy', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/security-test/unconfigured')
      .set('Authorization', `Bearer ${await fixture.signing.issue()}`)
      .expect(403);
    expect(fixture.state.authorizationRequests).toBe(0);
  });

  it('rejects an invalid resource identifier before requesting a decision', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/security-test/results/invalid')
      .set('Authorization', `Bearer ${await fixture.signing.issue()}`)
      .expect(400);
    expect(fixture.state.authorizationRequests).toBe(0);
  });
});
