import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../persistence/audit.repository.js';
import { AuditService } from './audit.service.js';

describe('Audit delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('redacts data before logging or passing it to persistence', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const service = new AuditService({ append } as unknown as AuditRepository);
    await service.record({
      requestId: randomUUID(),
      event: 'http.request',
      outcome: 'denied',
      details: { token: 'private-token', method: 'POST' },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-token');
    expect(JSON.stringify(append.mock.calls)).not.toContain('private-token');
  });
  it('logs a sanitized fallback when the database fails', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const service = new AuditService({
      append: async () => {
        throw new Error('private-database-secret');
      },
    } as unknown as AuditRepository);
    await expect(
      service.record({
        requestId: randomUUID(),
        event: 'http.request',
        outcome: 'failed',
      }),
    ).resolves.toBeUndefined();
    expect(
      JSON.stringify([...log.mock.calls, ...error.mock.calls]),
    ).not.toContain('private-database-secret');
  });
});
