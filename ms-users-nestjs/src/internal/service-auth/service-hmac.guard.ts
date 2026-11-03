import {
  CanActivate,
  ExecutionContext,
  Injectable,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { ServiceSignatureService } from './service-signature.service.js';

@Injectable()
export class ServiceHmacGuard implements CanActivate {
  constructor(private readonly signatureService: ServiceSignatureService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();

    const header = (name: string): string | undefined => {
      const value = request.headers[name];

      return Array.isArray(value) ? value[0] : value;
    };

    this.signatureService.verify({
      serviceId: header('x-service-id'),
      timestamp: header('x-service-timestamp'),
      nonce: header('x-service-nonce'),
      signature: header('x-service-signature'),
      rawBody: request.rawBody,
    });

    return true;
  }
}
