import { Inject, Injectable } from '@nestjs/common';
import { createLocalJWKSet, type LocalJWKSet } from 'jose';
import { AuthHttpClient } from '../clients/auth-http.client.js';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import { UnknownSigningKeyError } from '../errors/unknown-signing-key.error.js';
import { parseJwks } from '../utils/parse-jwks.js';

const CACHE_TTL_MS = 300000;
const REFRESH_COOLDOWN_MS = 30000;

@Injectable()
export class JwksService {
  private resolver?: LocalJWKSet;
  private keyIds = new Set<string>();
  private expiresAt = 0;
  private refreshAfter = 0;
  private pending?: Promise<void>;
  private refreshFailed = false;

  constructor(
    @Inject(AuthHttpClient) private readonly client: AuthHttpClient,
  ) {}

  async getKey(kid: string): Promise<CryptoKey> {
    const fresh = this.resolver !== undefined && Date.now() < this.expiresAt;
    if (!fresh || !this.keyIds.has(kid)) {
      if (this.pending) {
        await this.pending;
      } else if (Date.now() < this.refreshAfter) {
        if (fresh && !this.refreshFailed) throw new UnknownSigningKeyError();
        throw new AuthDependencyError();
      } else {
        this.refreshAfter = Date.now() + REFRESH_COOLDOWN_MS;
        this.pending = this.refresh();
        try {
          await this.pending;
        } finally {
          this.pending = undefined;
        }
      }
    }
    if (!this.resolver || !this.keyIds.has(kid))
      throw new UnknownSigningKeyError();
    try {
      return await this.resolver({ alg: 'RS256', kid });
    } catch {
      throw new AuthDependencyError();
    }
  }

  private async refresh(): Promise<void> {
    try {
      const response = await this.client.getJwks();
      if (response.status !== 200) throw new AuthDependencyError();
      const jwks = parseJwks(response.body);
      this.resolver = createLocalJWKSet(jwks);
      this.keyIds = new Set(jwks.keys.map((key) => key.kid!));
      this.expiresAt = Date.now() + CACHE_TTL_MS;
      this.refreshFailed = false;
    } catch {
      this.refreshFailed = true;
      throw new AuthDependencyError();
    }
  }
}
