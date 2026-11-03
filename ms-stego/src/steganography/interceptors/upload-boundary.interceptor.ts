import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize } from 'rxjs';
import {
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from '../config/upload.config.js';
import { UploadCapacityService } from '../services/upload-capacity.service.js';
import { clearUpload } from '../utils/clear-upload.js';

@Injectable()
export class UploadBoundaryInterceptor implements NestInterceptor {
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(UploadCapacityService)
    private readonly capacity: UploadCapacityService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.is('multipart/form-data'))
      throw new UnsupportedMediaTypeException(
        'Content-Type must be multipart/form-data',
      );
    const length = request.headers['content-length'];
    if (length !== undefined && !/^\d+$/.test(length))
      throw new BadRequestException('Invalid request length');
    if (
      length !== undefined &&
      Number(length) > this.config.UPLOAD_MAX_FILE_BYTES + 65536
    ) {
      throw new PayloadTooLargeException(
        'The multipart request exceeds the size limit',
      );
    }
    const release = this.capacity.acquire();
    const cleanup = () => {
      clearUpload(request);
      release();
    };
    try {
      return next.handle().pipe(finalize(cleanup));
    } catch (error) {
      cleanup();
      throw error;
    }
  }
}
