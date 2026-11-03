import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedSubject } from '../auth/interfaces/authenticated-subject.js';
import {
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from './config/upload.config.js';
import type { ValidatedImageDto } from './dto/validated-image.dto.js';
import { ImageValidationError } from './errors/image-validation.error.js';
import type { ImageFormat, ImageUpload } from './interfaces/image.js';
import { ImageDecoderService } from './services/image-decoder.service.js';
import { imageHttpError } from './utils/image-http-error.js';
import { validateUpload } from './utils/validate-upload.js';

@Injectable()
export class SteganographyService {
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(ImageDecoderService) private readonly decoder: ImageDecoderService,
  ) {}

  async validateImage(
    file: ImageUpload | undefined,
    subject: AuthenticatedSubject,
  ): Promise<ValidatedImageDto> {
    let format: ImageFormat;
    try {
      format = validateUpload(file, this.config);
    } catch (error) {
      if (error instanceof ImageValidationError) throw imageHttpError(error);
      throw error;
    }
    const image = await this.decoder.decode(file!.buffer, format);
    try {
      const uploadId = randomUUID();
      return {
        status: 'validated',
        upload_id: uploadId,
        user_id: subject.userId,
        filename: `${uploadId}.${format}`,
        original_filename: file!.originalname,
        sha256: createHash('sha256').update(file!.buffer).digest('hex'),
        format,
        size_bytes: file!.size,
        width: image.width,
        height: image.height,
      };
    } finally {
      image.pixels.fill(0);
    }
  }
}
