import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { POLICY_CONFIG, validatePolicyConfiguration } from './policy.config.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: POLICY_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        validatePolicyConfiguration({
          POLICY_SUSPICIOUS_ACTION: config.get('POLICY_SUSPICIOUS_ACTION'),
          POLICY_INCONCLUSIVE_ACTION: config.get('POLICY_INCONCLUSIVE_ACTION'),
        }),
    },
  ],
  exports: [POLICY_CONFIG],
})
export class PolicyConfigModule {}
