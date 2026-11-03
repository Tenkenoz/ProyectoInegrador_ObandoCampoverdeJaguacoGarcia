import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE } from '../decorators/public.decorator.js';
import type { SecurityRequest } from '../interfaces/security-request.js';
import { JwtVerifierService } from '../services/jwt-verifier.service.js';
import { extractBearerToken } from '../utils/bearer-token.js';

@Injectable()
export class JwtAuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtVerifierService) private readonly verifier: JwtVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const token = extractBearerToken(
      request.headers.authorization,
      request.rawHeaders,
    );
    request.subject = await this.verifier.verify(token);
    return true;
  }
}
