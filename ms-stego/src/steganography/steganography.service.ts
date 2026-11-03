import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedSubject } from '../auth/interfaces/authenticated-subject.js';
import {
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from './config/upload.config.js';
import { ImageValidationError } from './errors/image-validation.error.js';
import type { ImageFormat, ImageUpload } from './interfaces/image.js';
import { LsbDetectorService } from './lsb/lsb-detector.service.js';
import { PolicyService } from './policy/policy.service.js';
import { AnalysisPersistenceService } from './services/analysis-persistence.service.js';
import { PermitPool } from './utils/permit-pool.js';
import { imageHttpError } from './utils/image-http-error.js';
import { validateUpload } from './utils/validate-upload.js';

@Injectable()
export class SteganographyService {
  private readonly pool: PermitPool;
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(LsbDetectorService) private readonly detector: LsbDetectorService,
    @Inject(PolicyService) private readonly policy: PolicyService,
    @Inject(AnalysisPersistenceService)
    private readonly persistence: AnalysisPersistenceService,
  ) {
    this.pool = new PermitPool(config.UPLOAD_MAX_CONCURRENT);
  }

  async analyzeImage(
    file: ImageUpload | undefined,
    subject: AuthenticatedSubject,
    requestId: string = randomUUID(),
  ) {
    let format: ImageFormat;
    try {
      format = validateUpload(file, this.config);
    } catch (error) {
      if (error instanceof ImageValidationError) throw imageHttpError(error);
      throw error;
    }
    const release = this.pool.tryAcquire();
    if (!release)
      throw new ServiceUnavailableException(
        'Analysis processing capacity is exhausted',
      );
    let original: Buffer | undefined;
    try {
      original = Buffer.from(file!.buffer);
      const sha256 = createHash('sha256').update(original).digest('hex');
      const result = await this.detector.analyze(original, format);
      return await this.persistence.save(
        {
          userId: subject.userId,
          originalFilename: file!.originalname,
          sha256,
          format,
          sizeBytes: original.length,
          width: result.width,
          height: result.height,
          analyzedAt: new Date().toISOString(),
          detection: result.detection,
          detectorParameters: result.parameters,
          policy: this.policy.evaluate(result.detection.status),
        },
        original,
        requestId,
      );
    } finally {
      original?.fill(0);
      release();
    }
  }
}
