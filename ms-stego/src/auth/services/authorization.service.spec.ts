import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthHttpClient } from '../clients/auth-http.client.js';
import { AuthorizationService } from './authorization.service.js';
import { assertResourceOwnership } from '../utils/resource-ownership.js';

describe('Current authorization', () => {
  const subject = { userId: randomUUID(), tokenVersion: 0 };
  const resourceId = randomUUID();
  const grant = {
    subject_id: subject.userId,
    action: 'steganography.results.read' as const,
    resource_id: resourceId,
    allowed: true as const,
    scope: 'own' as const,
    reason: 'active_role_grants_permission' as const,
  };
  let checkAuthorization: ReturnType<typeof vi.fn>;
  let service: AuthorizationService;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    checkAuthorization = vi
      .fn()
      .mockResolvedValue({ status: 200, body: grant });
    service = new AuthorizationService({
      checkAuthorization,
    } as unknown as AuthHttpClient);
    log = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the exact action, subject token and resource', async () => {
    await expect(
      service.authorize(
        'sensitive-token',
        subject,
        'steganography.results.read',
        resourceId,
      ),
    ).resolves.toEqual(grant);
    expect(JSON.parse(checkAuthorization.mock.calls[0]![0] as string)).toEqual({
      subject_token: 'sensitive-token',
      action: 'steganography.results.read',
      resource_id: resourceId,
    });
  });

  it('checks AUTH again after role revocation with the same token', async () => {
    await service.authorize(
      'same-token',
      subject,
      'steganography.results.read',
      resourceId,
    );
    checkAuthorization.mockResolvedValueOnce({
      status: 200,
      body: {
        ...grant,
        allowed: false,
        scope: null,
        reason: 'insufficient_permissions',
      },
    });
    await expect(
      service.authorize(
        'same-token',
        subject,
        'steganography.results.read',
        resourceId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(checkAuthorization).toHaveBeenCalledTimes(2);
  });

  it.each(['invalid_subject_token', 'subject_inactive', 'session_revoked'])(
    'maps subject failure %s to 401',
    async (code) => {
      checkAuthorization.mockResolvedValueOnce({ status: 401, body: { code } });
      await expect(
        service.authorize(
          'token',
          subject,
          'steganography.results.read',
          resourceId,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it.each([
    { ...grant, subject_id: randomUUID() },
    { ...grant, action: 'steganography.analyze' },
    { ...grant, resource_id: randomUUID() },
    { ...grant, allowed: 'true' },
    { ...grant, scope: 'all' },
    { ...grant, allowed: false },
    { ...grant, reason: undefined },
  ])('rejects an inconsistent decision', async (body) => {
    checkAuthorization.mockResolvedValueOnce({ status: 200, body });
    await expect(
      service.authorize(
        'token',
        subject,
        'steganography.results.read',
        resourceId,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps service credential failures to 503', async () => {
    checkAuthorization.mockResolvedValueOnce({
      status: 401,
      body: { code: 'invalid_service_credentials' },
    });
    await expect(
      service.authorize(
        'token',
        subject,
        'steganography.results.read',
        resourceId,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed without leaking tokens or dependency errors into logs', async () => {
    checkAuthorization.mockRejectedValueOnce(
      new Error('private-secret sensitive-token'),
    );
    await expect(
      service.authorize(
        'sensitive-token',
        subject,
        'steganography.results.read',
        resourceId,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const entries = JSON.stringify(log.mock.calls);
    expect(entries).toContain('authorization_unavailable');
    expect(entries).not.toContain('sensitive-token');
    expect(entries).not.toContain('private-secret');
    expect(checkAuthorization).toHaveBeenCalledTimes(1);
  });

  it('allows own results and rejects other owners', () => {
    expect(() => assertResourceOwnership(grant, subject.userId)).not.toThrow();
    expect(() => assertResourceOwnership(grant, randomUUID())).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertResourceOwnership({ ...grant, scope: 'any' }, randomUUID()),
    ).not.toThrow();
  });
});
