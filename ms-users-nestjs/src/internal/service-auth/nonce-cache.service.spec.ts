import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { NonceCacheService } from './nonce-cache.service.js';

describe('NonceCacheService', () => {
  const now = 1_700_000_000_000;
  const nonce = 'a'.repeat(64);

  function createService(capacity = 2): NonceCacheService {
    const configService = {
      get: (key: string) => {
        if (key === 'AUTH_HMAC_NONCE_TTL_SECONDS') return 60;
        if (key === 'AUTH_HMAC_NONCE_CACHE_SIZE') return capacity;
        return undefined;
      },
    } as unknown as ConfigService;

    return new NonceCacheService(configService);
  }

  it('accepts a nonce once and rejects a replay', () => {
    const service = createService();

    expect(service.consume('stego', nonce, now)).toBe(true);
    expect(service.consume('stego', nonce, now + 1000)).toBe(false);
  });

  it('accepts the same nonce after the retention window', () => {
    const service = createService();

    expect(service.consume('stego', nonce, now)).toBe(true);
    expect(service.consume('stego', nonce, now + 60_001)).toBe(true);
  });

  it('does not share nonces between service identities', () => {
    const service = createService();

    expect(service.consume('stego', nonce, now)).toBe(true);
    expect(service.consume('other-service', nonce, now)).toBe(true);
  });

  it('denies new nonces when the bounded cache is full', () => {
    const service = createService(2);

    expect(service.consume('stego', 'a'.repeat(64), now)).toBe(true);
    expect(service.consume('stego', 'b'.repeat(64), now)).toBe(true);

    expect(() => service.consume('stego', 'c'.repeat(64), now)).toThrow(
      ServiceUnavailableException,
    );
  });
});
