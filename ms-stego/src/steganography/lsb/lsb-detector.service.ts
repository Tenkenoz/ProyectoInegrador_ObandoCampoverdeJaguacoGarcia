import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from '../config/upload.config.js';
import type { ImageFormat } from '../interfaces/image.js';
import { ImageWorkerService } from '../services/image-worker.service.js';
import { LSB_CONFIG, type LsbConfiguration } from './config/lsb.config.js';
import { lsbResultSchema } from './interfaces/lsb-result.schema.js';
import { classifyLsb } from './utils/classify-lsb.js';

const responseSchema = z.object({
  ok: z.literal(true),
  image: z.object({
    format: z.enum(['png', 'bmp']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  detection: lsbResultSchema,
});

@Injectable()
export class LsbDetectorService {
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly limits: UploadConfiguration,
    @Inject(LSB_CONFIG) private readonly config: LsbConfiguration,
    @Inject(ImageWorkerService) private readonly worker: ImageWorkerService,
  ) {}

  async analyze(buffer: Buffer, format: ImageFormat) {
    const parsed = responseSchema.safeParse(
      await this.worker.execute(buffer, format, this.config),
    );
    if (!parsed.success)
      throw new ServiceUnavailableException('Invalid LSB processing response');
    const { image, detection } = parsed.data;
    const indicators = detection.indicators;
    if (
      image.format !== format ||
      image.width > this.limits.IMAGE_MAX_WIDTH ||
      image.height > this.limits.IMAGE_MAX_HEIGHT ||
      image.width * image.height > this.limits.IMAGE_MAX_PIXELS ||
      indicators.pixel_count !== image.width * image.height ||
      indicators.sample_count !== indicators.pixel_count * 3 ||
      indicators.anomaly_score !== indicators.p_value ||
      indicators.threshold !== this.config.LSB_SUSPICIOUS_THRESHOLD ||
      indicators.clear_threshold !== this.config.LSB_CLEAR_THRESHOLD ||
      indicators.balance_tolerance !== this.config.LSB_BALANCE_TOLERANCE
    ) {
      throw new ServiceUnavailableException(
        'Inconsistent LSB processing response',
      );
    }
    if (detection.status !== 'error') {
      const decision = classifyLsb(indicators, detection.channels, this.config);
      if (
        decision.status !== detection.status ||
        decision.reason !== detection.reason ||
        detection.channels.length !== 3 ||
        detection.channels.some(
          (channel) => channel.sample_count !== indicators.pixel_count,
        ) ||
        indicators.degrees_of_freedom !==
          detection.channels.reduce(
            (sum, channel) => sum + channel.eligible_pairs,
            0,
          )
      ) {
        throw new ServiceUnavailableException('Inconsistent LSB evidence');
      }
    }
    return { ...image, detection };
  }
}
