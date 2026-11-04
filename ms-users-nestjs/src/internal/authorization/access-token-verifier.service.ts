import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtKeyService } from '../../auth/jwt-keys/jwt-key.service.js';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload/jwt-payload.interface.js';

@Injectable()
export class AccessTokenVerifierService {
  constructor(
    private readonly jwtService: JwtService,

    private readonly jwtKeyService: JwtKeyService,

    private readonly configService: ConfigService,
  ) {}

  async verify(token: string): Promise<JwtPayload> {
    try {
      if (!token || token.length > 8192) {
        throw new Error('Invalid token length');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        publicKey: this.jwtKeyService.getPublicKeyPem(),
        algorithms: ['RS256'],
        issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
        audience: this.configService.getOrThrow<string>('JWT_AUDIENCE'),
        clockTolerance:
          this.configService.get<number>('JWT_CLOCK_TOLERANCE_SECONDS') ?? 5,
      });

      if (
        payload.typ !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.tokenVersion !== 'number' ||
        !Number.isInteger(payload.tokenVersion) ||
        payload.tokenVersion < 0
      ) {
        throw new Error('Invalid token claims');
      }

      return payload;
    } catch {
      throw new UnauthorizedException({
        code: 'invalid_subject_token',
        message: 'Invalid subject token',
      });
    }
  }
}
