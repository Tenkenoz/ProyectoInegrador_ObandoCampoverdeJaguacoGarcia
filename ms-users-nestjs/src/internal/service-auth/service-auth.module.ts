import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module.js';
import { NonceCacheService } from './nonce-cache.service.js';
import { ServiceHmacGuard } from './service-hmac.guard.js';
import { ServiceSignatureService } from './service-signature.service.js';

@Module({
  imports: [AuditModule],
  providers: [NonceCacheService, ServiceSignatureService, ServiceHmacGuard],
  exports: [NonceCacheService, ServiceSignatureService, ServiceHmacGuard],
})
export class ServiceAuthModule {}
