import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AppController } from '../src/app.controller.js';
import { AppService } from '../src/app.service.js';
import { setupApp } from '../src/setup-app.js';

describe('Health and OpenAPI (HTTP)', () => {
  let app: INestApplication;
  const query = vi.fn();

  beforeEach(async () => {
    query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    const fixture = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();
    app = fixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports database availability', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', service: 'stego', database: 'up' });
  });

  it('GET /api/v1/health returns 503 when the database fails', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503)
      .expect({ status: 'error', service: 'stego', database: 'down' });
  });

  it('serves Swagger and the OpenAPI document', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
    const result = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(result.body.paths['/api/v1/health']).toBeDefined();
    expect(result.body.info.title).toBe('STEGO API');
  });
});
