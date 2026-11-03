import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { JwtKeysModule } from '../../auth/jwt-keys/jwt-keys.module.js';
import { AuthorizationModule } from '../../authorization/authorization.module.js';
import { UsersModule } from '../../users/users.module.js';
import { ServiceAuthModule } from '../service-auth/service-auth.module.js';
import { AccessTokenVerifierService } from './access-token-verifier.service.js';
import { InternalAuthorizationController } from './internal-authorization.controller.js';
import { InternalAuthorizationService } from './internal-authorization.service.js';

@Module({
  imports: [
    AuthModule,
    JwtKeysModule,
    UsersModule,
    AuthorizationModule,
    ServiceAuthModule,
  ],
  controllers: [InternalAuthorizationController],
  providers: [InternalAuthorizationService, AccessTokenVerifierService],
})
export class InternalAuthorizationModule {}
