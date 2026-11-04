import { Module } from '@nestjs/common';
import { AuthorizationPolicyService } from './authorization-policy.service.js';

@Module({
  providers: [AuthorizationPolicyService],
  exports: [AuthorizationPolicyService],
})
export class AuthorizationModule {}
