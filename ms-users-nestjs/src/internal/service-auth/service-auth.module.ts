import { Module } from '@nestjs/common';
import { NonceCacheService } from './nonce-cache.service.js';
import { ServiceHmacGuard } from './service-hmac.guard.js';
import { ServiceSignatureService } from './service-signature.service.js';

@Module({
  providers: [NonceCacheService, ServiceSignatureService, ServiceHmacGuard],
  exports: [NonceCacheService, ServiceSignatureService, ServiceHmacGuard],
})
export class ServiceAuthModule {}
