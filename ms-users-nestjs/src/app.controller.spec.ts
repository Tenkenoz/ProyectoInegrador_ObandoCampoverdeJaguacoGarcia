import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns service health and an ISO timestamp', () => {
      const result = appController.health();
      expect(result).toMatchObject({ status: 'ok', service: 'user-service' });
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
