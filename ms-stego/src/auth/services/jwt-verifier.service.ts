import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { z } from 'zod';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import type { AuthenticatedSubject } from '../interfaces/authenticated-subject.js';
import { JwksService } from './jwks.service.js';

const claimsSchema = z
  .object({
    sub: z.uuid(),
    typ: z.literal('access'),
    tokenVersion: z.number().int().nonnegative(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().nonnegative(),
  })
  .refine((value) => value.exp > value.iat && value.exp - value.iat <= 900);

@Injectable()
export class JwtVerifierService {
  constructor(@Inject(JwksService) private readonly jwks: JwksService) {}

  async verify(token: string): Promise<AuthenticatedSubject> {
    try {
      if (token.length > 8192)
        throw new UnauthorizedException('Invalid access token');
      const header = decodeProtectedHeader(token);
      if (
        header.alg !== 'RS256' ||
        typeof header.kid !== 'string' ||
        !header.kid ||
        header.kid.length > 128
      ) {
        throw new UnauthorizedException('Invalid access token');
      }
      const { payload } = await jwtVerify(
        token,
        () => this.jwks.getKey(header.kid!),
        {
          algorithms: ['RS256'],
          issuer: 'secure-chat-auth',
          audience: 'secure-chat-api',
          clockTolerance: 5,
          maxTokenAge: 900,
          requiredClaims: [
            'sub',
            'iss',
            'aud',
            'iat',
            'exp',
            'typ',
            'tokenVersion',
          ],
        },
      );
      const parsed = claimsSchema.safeParse(payload);
      if (!parsed.success)
        throw new UnauthorizedException('Invalid access token');
      return {
        userId: parsed.data.sub,
        tokenVersion: parsed.data.tokenVersion,
      };
    } catch (error) {
      if (error instanceof AuthDependencyError) {
        throw new ServiceUnavailableException(
          'Authentication service is unavailable',
        );
      }
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
