import type { Repository } from 'typeorm';
import { AuditService } from './audit.service.js';
import { AuditEvent } from './entities/audit-event.entity.js';

describe('AuditService', () => {
  function createService() {
    const create = vi.fn((value: Partial<AuditEvent>) => value);
    const save = vi.fn().mockResolvedValue(undefined);
    const repository = {
      create,
      save,
    } as unknown as Repository<AuditEvent>;

    return {
      service: new AuditService(repository),
      create,
      save,
    };
  }

  it('persists only allow-listed audit fields', async () => {
    const { service, create, save } = createService();

    await service.record({
      eventType: 'auth.login.succeeded',
      action: 'auth.login',
      actorId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      subjectId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      decision: 'succeeded',
      reason: 'authenticated',
      requestId: 'request-1',
      password: 'must-not-be-persisted',
      accessToken: 'must-not-be-persisted',
    } as never);

    expect(create).toHaveBeenCalledWith({
      eventType: 'auth.login.succeeded',
      actorId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      subjectId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      action: 'auth.login',
      resourceId: null,
      decision: 'succeeded',
      reason: 'authenticated',
      requestId: 'request-1',
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain('password');
    expect(JSON.stringify(create.mock.calls)).not.toContain('accessToken');
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not propagate audit storage failures', async () => {
    const { service, save } = createService();
    save.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.record({
        eventType: 'auth.logout',
        action: 'auth.logout',
        decision: 'succeeded',
      }),
    ).resolves.toBeUndefined();
  });
});
