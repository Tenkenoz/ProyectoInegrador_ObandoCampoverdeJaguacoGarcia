import { ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';
import { DataSource } from 'typeorm';

describe('Health', () => {
  it('reports an available database', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new AppService({ query } as unknown as DataSource);
    await expect(service.health()).resolves.toEqual({
      status: 'ok',
      service: 'stego',
      database: 'up',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns 503 without exposing database errors or credentials', async () => {
    const query = vi.fn().mockRejectedValue(new Error('password=secret'));
    const service = new AppService({ query } as unknown as DataSource);
    try {
      await service.health();
      throw new Error('Expected health check to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = error as ServiceUnavailableException;
      expect(response.getStatus()).toBe(503);
      expect(JSON.stringify(response.getResponse())).not.toContain('secret');
    }
  });
});
