import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LSB_CONFIG, validateLsbConfiguration } from './lsb.config.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LSB_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        validateLsbConfiguration({
          LSB_SUSPICIOUS_THRESHOLD: config.get('LSB_SUSPICIOUS_THRESHOLD'),
          LSB_CLEAR_THRESHOLD: config.get('LSB_CLEAR_THRESHOLD'),
          LSB_BALANCE_TOLERANCE: config.get('LSB_BALANCE_TOLERANCE'),
          LSB_MIN_PIXELS: config.get('LSB_MIN_PIXELS'),
          LSB_MIN_EXPECTED_COUNT: config.get('LSB_MIN_EXPECTED_COUNT'),
          LSB_MIN_PAIRS: config.get('LSB_MIN_PAIRS'),
          LSB_MIN_COVERAGE: config.get('LSB_MIN_COVERAGE'),
        }),
    },
  ],
  exports: [LSB_CONFIG],
})
export class LsbConfigModule {}
