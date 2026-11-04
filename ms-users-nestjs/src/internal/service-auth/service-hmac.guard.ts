import {
  CanActivate,
  ExecutionContext,
  Injectable,
  type RawBodyRequest,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { getExceptionCode } from '../../common/http/exception-code.js';
import type { RequestWithId } from '../../common/interfaces/request-with-id.js';
import { ServiceSignatureService } from './service-signature.service.js';

@Injectable()
export class ServiceHmacGuard implements CanActivate {
  constructor(
    private readonly signatureService: ServiceSignatureService,

    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<RequestWithId>>();

    const header = (name: string): string | undefined => {
      const value = request.headers[name];

      return Array.isArray(value) ? value[0] : value;
    };

    try {
      this.signatureService.verify({
        serviceId: header('x-service-id'),
        timestamp: header('x-service-timestamp'),
        nonce: header('x-service-nonce'),
        signature: header('x-service-signature'),
        rawBody: request.rawBody,
      });

      return true;
    } catch (error) {
      await this.auditService.record({
        eventType: 'service_auth.failed',
        actorId: null,
        subjectId: null,
        action: 'service_authorization',
        resourceId: null,
        decision: 'failed',
        reason: getExceptionCode(error, 'invalid_service_credentials'),
        requestId: request.requestId ?? null,
      });

      throw error;
    }
  }
}
