import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../src/app.controller.js';
import { AppService } from '../src/app.service.js';

describe('AppController (HTTP)', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
  });
  afterEach(async () => { await app.close(); });
  it('GET / returns the initial response', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });
});
