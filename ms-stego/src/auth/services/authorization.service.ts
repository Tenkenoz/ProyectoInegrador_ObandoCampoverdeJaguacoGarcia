import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthHttpClient } from '../clients/auth-http.client.js';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import type { AuthenticatedSubject } from '../interfaces/authenticated-subject.js';
import type {
  AuthorizationAction,
  AuthorizationGrant,
  AuthorizationRequest,
} from '../interfaces/authorization.js';
import { parseAuthorizationDecision } from '../utils/authorization-decision.js';

const SUBJECT_ERROR_CODES = new Set([
  'invalid_subject_token',
  'subject_inactive',
  'session_revoked',
]);

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    @Inject(AuthHttpClient) private readonly client: AuthHttpClient,
  ) {}

  async authorize(
    token: string,
    subject: AuthenticatedSubject,
    action: AuthorizationAction,
    resourceId: string | null,
  ): Promise<AuthorizationGrant> {
    const payload: AuthorizationRequest = {
      subject_token: token,
      action,
      resource_id: resourceId,
    };
    try {
      const response = await this.client.checkAuthorization(
        JSON.stringify(payload),
      );
      if (response.status === 401) {
        const body = response.body;
        if (
          typeof body === 'object' &&
          body !== null &&
          'code' in body &&
          typeof body.code === 'string' &&
          SUBJECT_ERROR_CODES.has(body.code)
        ) {
          throw new UnauthorizedException(
            'The access session is no longer valid',
          );
        }
        throw new AuthDependencyError();
      }
      if (response.status !== 200) throw new AuthDependencyError();
      const decision = parseAuthorizationDecision(
        response.body,
        subject.userId,
        action,
        resourceId,
      );
      if (!decision.allowed)
        throw new ForbiddenException('Insufficient permissions');
      return decision;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      )
        throw error;
      this.logger.warn({
        event: 'authorization_unavailable',
        subjectId: subject.userId,
        action,
        resourceId,
      });
      throw new ServiceUnavailableException(
        'Authorization service is unavailable',
      );
    }
  }
}
