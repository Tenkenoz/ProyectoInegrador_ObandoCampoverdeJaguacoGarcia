import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadConfigModule } from './config/upload-config.module.js';
import {
  IMAGE_WORKER_URL,
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from './config/upload.config.js';
import { UploadBoundaryInterceptor } from './interceptors/upload-boundary.interceptor.js';
import { LsbConfigModule } from './lsb/config/lsb-config.module.js';
import { LsbDetectorService } from './lsb/lsb-detector.service.js';
import { ImageWorkerService } from './services/image-worker.service.js';
import { ImageDecoderService } from './services/image-decoder.service.js';
import { UploadCapacityService } from './services/upload-capacity.service.js';
import { SteganographyController } from './steganography.controller.js';
import { SteganographyService } from './steganography.service.js';
import { createUploadOptions } from './utils/upload-options.js';

@Module({
  imports: [
    UploadConfigModule,
    LsbConfigModule,
    MulterModule.registerAsync({
      imports: [UploadConfigModule],
      inject: [UPLOAD_CONFIG],
      useFactory: (config: UploadConfiguration) => createUploadOptions(config),
    }),
  ],
  controllers: [SteganographyController],
  providers: [
    {
      provide: IMAGE_WORKER_URL,
      useValue: new URL('./workers/image-decoder.worker.js', import.meta.url),
    },
    ImageDecoderService,
    ImageWorkerService,
    LsbDetectorService,
    UploadCapacityService,
    UploadBoundaryInterceptor,
    SteganographyService,
  ],
})
export class SteganographyModule {}
