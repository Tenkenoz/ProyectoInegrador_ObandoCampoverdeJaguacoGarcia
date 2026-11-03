import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { INTERNAL_AUTHORIZATION_PATH } from '../../authorization/authorization.types.js';
import { NonceCacheService } from './nonce-cache.service.js';

export interface ServiceSignatureInput {
  serviceId?: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
  rawBody?: Buffer;
}

@Injectable()
export class ServiceSignatureService {
  private readonly serviceId: string;
  private readonly secret: Buffer;
  private readonly clockSkewSeconds: number;

  constructor(
    configService: ConfigService,

    private readonly nonceCache: NonceCacheService,
  ) {
    this.serviceId = configService.getOrThrow<string>('AUTH_SERVICE_ID');

    const secretHex = configService.getOrThrow<string>('AUTH_SERVICE_SECRET');
    this.secret = Buffer.from(secretHex, 'hex');

    if (this.secret.length !== 32) {
      throw new Error('AUTH_SERVICE_SECRET must decode to 32 bytes');
    }

    this.clockSkewSeconds =
      configService.get<number>('AUTH_HMAC_CLOCK_SKEW_SECONDS') ?? 30;
  }

  verify(input: ServiceSignatureInput, now = Date.now()): void {
    const { serviceId, timestamp, nonce, signature } = input;

    if (serviceId !== this.serviceId) {
      this.fail();
    }

    if (!timestamp || !/^\d+$/.test(timestamp)) {
      this.fail();
    }

    if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) {
      this.fail();
    }

    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) {
      this.fail();
    }

    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(now / 1000);

    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > this.clockSkewSeconds
    ) {
      this.fail();
    }

    const bodyDigest = createHash('sha256')
      .update(input.rawBody ?? Buffer.alloc(0))
      .digest('hex');

    const message = [
      serviceId,
      'POST',
      INTERNAL_AUTHORIZATION_PATH,
      timestamp,
      nonce,
      bodyDigest,
    ].join('\n');

    const expectedSignature = createHmac('sha256', this.secret)
      .update(message, 'utf8')
      .digest();

    const providedSignature = Buffer.from(signature, 'hex');

    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      this.fail();
    }

    if (!this.nonceCache.consume(serviceId, nonce, now)) {
      this.fail();
    }
  }

  private fail(): never {
    throw new UnauthorizedException({
      code: 'invalid_service_credentials',
      message: 'Invalid service credentials',
    });
  }
}
