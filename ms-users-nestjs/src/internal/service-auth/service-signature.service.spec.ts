import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { INTERNAL_AUTHORIZATION_PATH } from '../../authorization/authorization.types.js';
import { NonceCacheService } from './nonce-cache.service.js';
import {
  ServiceSignatureService,
  type ServiceSignatureInput,
} from './service-signature.service.js';

describe('ServiceSignatureService', () => {
  const secret = '11'.repeat(32);
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000).toString();

  function createService(): ServiceSignatureService {
    const configService = {
      get: (key: string) => {
        if (key === 'AUTH_HMAC_CLOCK_SKEW_SECONDS') return 30;
        if (key === 'AUTH_HMAC_NONCE_TTL_SECONDS') return 60;
        if (key === 'AUTH_HMAC_NONCE_CACHE_SIZE') return 100;
        return undefined;
      },
      getOrThrow: (key: string) => {
        if (key === 'AUTH_SERVICE_ID') return 'stego';
        if (key === 'AUTH_SERVICE_SECRET') return secret;
        throw new Error(`Missing ${key}`);
      },
    } as unknown as ConfigService;

    const nonceCache = new NonceCacheService(configService);

    return new ServiceSignatureService(configService, nonceCache);
  }

  function sign(
    body: string,
    options: {
      timestamp?: string;
      nonce?: string;
      serviceId?: string;
      signingSecret?: string;
    } = {},
  ): ServiceSignatureInput {
    const serviceId = options.serviceId ?? 'stego';
    const nonce = options.nonce ?? 'a'.repeat(64);
    const requestTimestamp = options.timestamp ?? timestamp;
    const digest = createHash('sha256').update(body).digest('hex');
    const message = [
      serviceId,
      'POST',
      INTERNAL_AUTHORIZATION_PATH,
      requestTimestamp,
      nonce,
      digest,
    ].join('\n');
    const signature = createHmac(
      'sha256',
      Buffer.from(options.signingSecret ?? secret, 'hex'),
    )
      .update(message, 'utf8')
      .digest('hex');

    return {
      serviceId,
      timestamp: requestTimestamp,
      nonce,
      signature,
      rawBody: Buffer.from(body),
    };
  }

  it('accepts a correctly signed request', () => {
    const service = createService();
    const body = '{"action":"steganography.analyze"}';

    expect(() => service.verify(sign(body), now)).not.toThrow();
  });

  it('rejects a modified body', () => {
    const service = createService();
    const signed = sign('{"action":"steganography.analyze"}');

    signed.rawBody = Buffer.from('{"action":"steganography.results.read"}');

    expect(() => service.verify(signed, now)).toThrow(UnauthorizedException);
  });

  it('rejects an invalid signature, service, timestamp or nonce', () => {
    const service = createService();
    const body = '{"action":"steganography.analyze"}';

    expect(() =>
      service.verify({ ...sign(body), signature: '0'.repeat(64) }, now),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.verify(sign(body, { serviceId: 'other' }), now),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.verify(
        sign(body, { timestamp: (Number(timestamp) - 31).toString() }),
        now,
      ),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.verify(sign(body, { nonce: 'not-a-nonce' }), now),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a replayed nonce', () => {
    const service = createService();
    const body = '{"action":"steganography.analyze"}';
    const signed = sign(body);

    expect(() => service.verify(signed, now)).not.toThrow();
    expect(() => service.verify(signed, now + 1000)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects missing credentials', () => {
    const service = createService();

    expect(() => service.verify({}, now)).toThrow(UnauthorizedException);
  });
});
