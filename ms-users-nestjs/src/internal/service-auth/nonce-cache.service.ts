import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NonceCacheService {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly capacity: number;

  constructor(configService: ConfigService) {
    this.ttlMs =
      (configService.get<number>('AUTH_HMAC_NONCE_TTL_SECONDS') ?? 60) * 1000;
    this.capacity =
      configService.get<number>('AUTH_HMAC_NONCE_CACHE_SIZE') ?? 10_000;
  }

  consume(serviceId: string, nonce: string, now = Date.now()): boolean {
    this.removeExpired(now);

    const key = `${serviceId}:${nonce}`;
    const expiresAt = this.entries.get(key);

    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }

    if (this.entries.size >= this.capacity) {
      throw new ServiceUnavailableException({
        code: 'authorization_unavailable',
        message: 'Authorization is unavailable',
      });
    }

    this.entries.set(key, now + this.ttlMs);

    return true;
  }

  get size(): number {
    return this.entries.size;
  }

  private removeExpired(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
