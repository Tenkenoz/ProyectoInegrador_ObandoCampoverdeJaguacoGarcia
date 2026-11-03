import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthHttpClient } from './clients/auth-http.client.js';
import {
  AUTH_CONFIG,
  validateAuthConfiguration,
} from './config/auth.config.js';
import { AuthorizationGuard } from './guards/authorization.guard.js';
import { JwtAuthenticationGuard } from './guards/jwt-authentication.guard.js';
import { AuthorizationService } from './services/authorization.service.js';
import { JwksService } from './services/jwks.service.js';
import { JwtVerifierService } from './services/jwt-verifier.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        validateAuthConfiguration({
          AUTH_BASE_URL: config.get('AUTH_BASE_URL'),
          AUTH_JWKS_URL: config.get('AUTH_JWKS_URL'),
          AUTH_CA_CERT_PATH: config.get('AUTH_CA_CERT_PATH'),
          AUTH_SERVICE_ID: config.get('AUTH_SERVICE_ID'),
          AUTH_SERVICE_SECRET: config.get('AUTH_SERVICE_SECRET'),
          AUTH_TIMEOUT_MS: config.get('AUTH_TIMEOUT_MS'),
        }),
    },
    AuthHttpClient,
    JwksService,
    JwtVerifierService,
    AuthorizationService,
    { provide: APP_GUARD, useClass: JwtAuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
  exports: [AuthorizationService, JwtVerifierService],
})
export class AuthModule {}
