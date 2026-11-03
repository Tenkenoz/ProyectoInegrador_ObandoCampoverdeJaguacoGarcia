import {
  Inject,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import {
  IMAGE_WORKER_URL,
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type { ImageFormat } from '../interfaces/image.js';
import type { LsbConfiguration } from '../lsb/config/lsb.config.js';
import { imageHttpError } from '../utils/image-http-error.js';
import { PermitPool } from '../utils/permit-pool.js';

const envelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).passthrough(),
  z.object({
    ok: z.literal(false),
    status: z.union([z.literal(400), z.literal(413), z.literal(415)]),
    message: z.string().max(200),
  }),
]);

@Injectable()
export class ImageWorkerService {
  private readonly pool: PermitPool;

  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(IMAGE_WORKER_URL) private readonly workerUrl: URL,
  ) {
    this.pool = new PermitPool(config.UPLOAD_MAX_CONCURRENT);
  }

  async execute(
    buffer: Buffer,
    format: ImageFormat,
    detectorConfig?: LsbConfiguration,
  ): Promise<unknown> {
    const release = this.pool.tryAcquire();
    if (!release)
      throw new ServiceUnavailableException(
        'Image processing capacity is exhausted',
      );
    let worker: Worker;
    try {
      worker = new Worker(this.workerUrl, {
        workerData: { buffer, format, limits: this.config, detectorConfig },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      });
    } catch {
      release();
      throw new ServiceUnavailableException('Image processing is unavailable');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new PayloadTooLargeException(
                'The image processing time limit was exceeded',
              ),
            ),
          this.config.IMAGE_DECODE_TIMEOUT_MS,
        );
        worker.once('error', () =>
          reject(
            new ServiceUnavailableException('Image processing is unavailable'),
          ),
        );
        worker.once('exit', () =>
          reject(
            new ServiceUnavailableException(
              'Image processing ended unexpectedly',
            ),
          ),
        );
        worker.once('message', (value: unknown) => {
          const parsed = envelopeSchema.safeParse(value);
          if (!parsed.success) {
            reject(
              new ServiceUnavailableException(
                'Invalid image processing response',
              ),
            );
            return;
          }
          if (!parsed.data.ok) {
            reject(
              imageHttpError(
                new ImageValidationError(
                  parsed.data.status,
                  parsed.data.message,
                ),
              ),
            );
            return;
          }
          resolve(parsed.data);
        });
      });
    } finally {
      clearTimeout(timer);
      try {
        await worker.terminate();
      } finally {
        release();
      }
    }
  }
}
