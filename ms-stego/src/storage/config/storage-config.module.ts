import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  STORAGE_CONFIG,
  validateStorageConfiguration,
} from './storage.config.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        validateStorageConfiguration({
          QUARANTINE_DIR: config.get('QUARANTINE_DIR'),
          QUARANTINE_RETENTION_SECONDS: config.get(
            'QUARANTINE_RETENTION_SECONDS',
          ),
          QUARANTINE_MAX_BYTES: config.get('QUARANTINE_MAX_BYTES'),
          QUARANTINE_MAX_FILES: config.get('QUARANTINE_MAX_FILES'),
          QUARANTINE_CLEANUP_INTERVAL_MS: config.get(
            'QUARANTINE_CLEANUP_INTERVAL_MS',
          ),
          QUARANTINE_ORPHAN_GRACE_SECONDS: config.get(
            'QUARANTINE_ORPHAN_GRACE_SECONDS',
          ),
        }),
    },
  ],
  exports: [STORAGE_CONFIG],
})
export class StorageConfigModule {}
