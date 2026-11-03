import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service.js';
import type { AuthorizationCheckResponse } from '../../authorization/authorization.types.js';
import { getExceptionCode } from '../../common/http/exception-code.js';
import { UsersService } from '../../users/users.service.js';
import { AccessTokenVerifierService } from './access-token-verifier.service.js';
import { AuthorizationCheckDto } from './dto/authorization-check.dto.js';

@Injectable()
export class InternalAuthorizationService {
  constructor(
    private readonly usersService: UsersService,

    private readonly authorizationPolicy: AuthorizationPolicyService,

    private readonly accessTokenVerifier: AccessTokenVerifierService,

    private readonly auditService: AuditService,
  ) {}

  async check(
    dto: AuthorizationCheckDto,
    requestId?: string,
  ): Promise<AuthorizationCheckResponse> {
    let subjectId: string | null = null;

    try {
      const resourceId = this.validateResource(dto);
      const payload = await this.accessTokenVerifier.verify(dto.subject_token);
      subjectId = payload.sub;
      const user = await this.usersService.findActiveWithRoles(payload.sub);

      if (!user) {
        throw new UnauthorizedException({
          code: 'subject_inactive',
          message: 'Subject is not active',
        });
      }

      if (payload.tokenVersion !== user.tokenVersion) {
        throw new UnauthorizedException({
          code: 'session_revoked',
          message: 'Subject session is no longer valid',
        });
      }

      const roles =
        user.userRoles
          ?.filter(
            (userRole) =>
              userRole.estado &&
              userRole.role !== undefined &&
              userRole.role !== null &&
              userRole.role.estado,
          )
          .map((userRole) => userRole.role.rol) ?? [];

      const decision = this.authorizationPolicy.evaluate(roles, dto.action);

      await this.auditService.record({
        eventType: decision.allowed
          ? 'authorization.allowed'
          : 'authorization.denied',
        actorId: user.id,
        subjectId: user.id,
        action: dto.action,
        resourceId,
        decision: decision.allowed ? 'allowed' : 'denied',
        reason: decision.reason,
        requestId: requestId ?? null,
      });

      return {
        subject_id: user.id,
        action: dto.action,
        resource_id: resourceId,
        allowed: decision.allowed,
        scope: decision.scope,
        reason: decision.reason,
      };
    } catch (error) {
      await this.auditService.record({
        eventType: 'authorization.failed',
        actorId: subjectId,
        subjectId,
        action: dto.action,
        resourceId: dto.resource_id ?? null,
        decision: 'failed',
        reason: getExceptionCode(error, 'authorization_unavailable'),
        requestId: requestId ?? null,
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new ServiceUnavailableException({
        code: 'authorization_unavailable',
        message: 'Authorization is unavailable',
      });
    }
  }

  private validateResource(dto: AuthorizationCheckDto): string | null {
    if (dto.action === 'steganography.analyze') {
      if (dto.resource_id !== undefined && dto.resource_id !== null) {
        throw this.invalidRequest(
          'resource_id must be null for steganography.analyze',
        );
      }

      return null;
    }

    if (!dto.resource_id) {
      throw this.invalidRequest(
        'resource_id is required for steganography.results.read',
      );
    }

    return dto.resource_id;
  }

  private invalidRequest(message: string): BadRequestException {
    return new BadRequestException({
      code: 'invalid_authorization_request',
      message,
    });
  }
}
