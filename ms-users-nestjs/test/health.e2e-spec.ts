import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../src/app.controller.js';

describe('Health endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    app = moduleReference.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the service as available', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'user-service',
    });
  });
});
