import type { INestApplication } from '@nestjs/common';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwksController } from '../src/auth/jwks/jwks.controller.js';
import { JwtKeyService } from '../src/auth/jwt-keys/jwt-key.service.js';

describe('JWKS endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [JwksController],
      providers: [
        {
          provide: JwtKeyService,
          useValue: {
            getJwks: () => ({
              keys: [
                {
                  kty: 'RSA',
                  use: 'sig',
                  alg: 'RS256',
                  kid: 'test-key-1',
                  n: 'test-modulus',
                  e: 'AQAB',
                },
              ],
            }),
          },
        },
      ],
    }).compile();

    app = moduleReference.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [
        {
          path: '.well-known/jwks.json',
          method: RequestMethod.GET,
        },
      ],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the public keys at the root path', async () => {
    const response = await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body).toEqual({
      keys: [
        {
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: 'test-key-1',
          n: 'test-modulus',
          e: 'AQAB',
        },
      ],
    });
  });

  it('does not expose the JWKS route under the API prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/.well-known/jwks.json')
      .expect(404);
  });
});
