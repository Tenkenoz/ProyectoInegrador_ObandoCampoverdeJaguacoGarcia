import {
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service.js';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload/jwt-payload.interface.js';
import { UsersService } from '../../users/users.service.js';
import { AccessTokenVerifierService } from './access-token-verifier.service.js';
import { InternalAuthorizationService } from './internal-authorization.service.js';

const userId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const resourceId = '7d444840-9dc0-11d1-b245-5ffdce74fad2';

function activeUser(roles: string[], tokenVersion = 0) {
  return {
    id: userId,
    tokenVersion,
    userRoles: roles.map((rol) => ({
      estado: true,
      role: {
        rol,
        estado: true,
      },
    })),
  };
}

function payload(tokenVersion = 0): JwtPayload {
  return {
    sub: userId,
    username: 'admin',
    tokenVersion,
    typ: 'access',
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected request to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe('InternalAuthorizationService', () => {
  let service: InternalAuthorizationService;
  let verifyToken: ReturnType<typeof vi.fn>;
  let findActiveWithRoles: ReturnType<typeof vi.fn>;
  let recordAudit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const authorizationPolicy = new AuthorizationPolicyService();

    verifyToken = vi.fn().mockResolvedValue(payload());
    findActiveWithRoles = vi.fn().mockResolvedValue(activeUser(['ADMIN']));
    recordAudit = vi.fn().mockResolvedValue(undefined);

    const verifier = {
      verify: verifyToken,
    } as unknown as AccessTokenVerifierService;

    const usersService = {
      findActiveWithRoles,
    } as unknown as UsersService;

    const auditService = {
      record: recordAudit,
    } as unknown as AuditService;

    service = new InternalAuthorizationService(
      usersService,
      authorizationPolicy,
      verifier,
      auditService,
    );
  });

  it('allows ADMIN to analyze with any scope', async () => {
    await expect(
      service.check({
        subject_token: 'token',
        action: 'steganography.analyze',
        resource_id: null,
      }),
    ).resolves.toEqual({
      subject_id: userId,
      action: 'steganography.analyze',
      resource_id: null,
      allowed: true,
      scope: 'any',
      reason: 'active_role_grants_permission',
    });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'authorization.allowed',
        actorId: userId,
        subjectId: userId,
        action: 'steganography.analyze',
        decision: 'allowed',
      }),
    );
  });

  it('allows ANALYST to read their own results', async () => {
    findActiveWithRoles.mockResolvedValueOnce(activeUser(['ANALYST']) as never);

    await expect(
      service.check({
        subject_token: 'token',
        action: 'steganography.results.read',
        resource_id: resourceId,
      }),
    ).resolves.toEqual({
      subject_id: userId,
      action: 'steganography.results.read',
      resource_id: resourceId,
      allowed: true,
      scope: 'own',
      reason: 'active_role_grants_permission',
    });
  });

  it('denies USER without leaking a resource decision', async () => {
    findActiveWithRoles.mockResolvedValueOnce(activeUser(['USER']) as never);

    await expect(
      service.check({
        subject_token: 'token',
        action: 'steganography.analyze',
        resource_id: null,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      scope: null,
      reason: 'insufficient_permissions',
    });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'authorization.denied',
        actorId: userId,
        subjectId: userId,
        decision: 'denied',
      }),
    );
  });

  it('rejects inactive users, revoked sessions and invalid tokens', async () => {
    findActiveWithRoles.mockResolvedValueOnce(null);

    await expectCode(
      service.check({
        subject_token: 'token',
        action: 'steganography.analyze',
        resource_id: null,
      }),
      'subject_inactive',
    );

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'authorization.failed',
        reason: 'subject_inactive',
      }),
    );

    findActiveWithRoles.mockResolvedValueOnce(
      activeUser(['ADMIN'], 1) as never,
    );

    await expectCode(
      service.check({
        subject_token: 'token',
        action: 'steganography.analyze',
        resource_id: null,
      }),
      'session_revoked',
    );

    verifyToken.mockRejectedValueOnce(
      new UnauthorizedException({
        code: 'invalid_subject_token',
        message: 'Invalid subject token',
      }),
    );

    await expectCode(
      service.check({
        subject_token: 'invalid',
        action: 'steganography.analyze',
        resource_id: null,
      }),
      'invalid_subject_token',
    );
  });

  it('rejects resource identifiers that do not match the action', async () => {
    await expectCode(
      service.check({
        subject_token: 'token',
        action: 'steganography.analyze',
        resource_id: resourceId,
      }),
      'invalid_authorization_request',
    );

    await expectCode(
      service.check({
        subject_token: 'token',
        action: 'steganography.results.read',
        resource_id: null,
      }),
      'invalid_authorization_request',
    );
  });

  it('returns a stable 503 code when the dependency fails', async () => {
    findActiveWithRoles.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    try {
      await service.check({
        subject_token: 'token',
        action: 'steganography.analyze',
        resource_id: null,
      });
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        (error as ServiceUnavailableException).getResponse(),
      ).toMatchObject({
        code: 'authorization_unavailable',
      });
    }
  });
});
