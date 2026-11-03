import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { createSecureContext } from 'node:tls';
import { AUTH_CONFIG, type AuthConfiguration } from '../config/auth.config.js';
import { requestHttpsJson } from '../utils/https-json.js';
import {
  AUTHORIZATION_PATH,
  createServiceHeaders,
} from '../utils/service-signature.js';

@Injectable()
export class AuthHttpClient implements OnModuleDestroy {
  private readonly agent: Agent;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfiguration) {
    let ca: Buffer;
    try {
      ca = readFileSync(config.AUTH_CA_CERT_PATH);
      createSecureContext({ ca });
    } catch {
      throw new Error('Unable to load the AUTH CA certificate');
    }
    this.agent = new Agent({
      ca,
      rejectUnauthorized: true,
      keepAlive: true,
      maxSockets: 16,
    });
  }

  getJwks() {
    return requestHttpsJson(
      new URL(this.config.AUTH_JWKS_URL),
      this.agent,
      this.config.AUTH_TIMEOUT_MS,
    );
  }

  checkAuthorization(body: string) {
    const headers = createServiceHeaders(
      body,
      this.config.AUTH_SERVICE_ID,
      this.config.AUTH_SERVICE_SECRET,
    );
    return requestHttpsJson(
      new URL(AUTHORIZATION_PATH, this.config.AUTH_BASE_URL),
      this.agent,
      this.config.AUTH_TIMEOUT_MS,
      body,
      headers,
    );
  }

  onModuleDestroy(): void {
    this.agent.destroy();
  }
}
