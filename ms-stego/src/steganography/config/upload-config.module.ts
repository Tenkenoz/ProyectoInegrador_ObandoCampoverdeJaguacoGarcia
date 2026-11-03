import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UPLOAD_CONFIG, validateUploadConfiguration } from './upload.config.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: UPLOAD_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        validateUploadConfiguration({
          UPLOAD_MAX_FILE_BYTES: config.get('UPLOAD_MAX_FILE_BYTES'),
          IMAGE_MAX_WIDTH: config.get('IMAGE_MAX_WIDTH'),
          IMAGE_MAX_HEIGHT: config.get('IMAGE_MAX_HEIGHT'),
          IMAGE_MAX_PIXELS: config.get('IMAGE_MAX_PIXELS'),
          IMAGE_DECODE_TIMEOUT_MS: config.get('IMAGE_DECODE_TIMEOUT_MS'),
          UPLOAD_MAX_CONCURRENT: config.get('UPLOAD_MAX_CONCURRENT'),
        }),
    },
  ],
  exports: [UPLOAD_CONFIG],
})
export class UploadConfigModule {}
