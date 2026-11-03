import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedSubject } from '../auth/interfaces/authenticated-subject.js';
import {
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from './config/upload.config.js';
import type { AnalysisResultDto } from './dto/analysis-result.dto.js';
import { ImageValidationError } from './errors/image-validation.error.js';
import type { ImageFormat, ImageUpload } from './interfaces/image.js';
import { LsbDetectorService } from './lsb/lsb-detector.service.js';
import { imageHttpError } from './utils/image-http-error.js';
import { validateUpload } from './utils/validate-upload.js';

@Injectable()
export class SteganographyService {
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(LsbDetectorService) private readonly detector: LsbDetectorService,
  ) {}

  async analyzeImage(
    file: ImageUpload | undefined,
    subject: AuthenticatedSubject,
  ): Promise<AnalysisResultDto> {
    let format: ImageFormat;
    try {
      format = validateUpload(file, this.config);
    } catch (error) {
      if (error instanceof ImageValidationError) throw imageHttpError(error);
      throw error;
    }
    const result = await this.detector.analyze(file!.buffer, format);
    const uploadId = randomUUID();
    return {
      upload_id: uploadId,
      user_id: subject.userId,
      filename: `${uploadId}.${format}`,
      original_filename: file!.originalname,
      sha256: createHash('sha256').update(file!.buffer).digest('hex'),
      format,
      size_bytes: file!.size,
      width: result.width,
      height: result.height,
      ...result.detection,
      analyzed_at: new Date().toISOString(),
    };
  }
}
