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
import type { DecodedImage, ImageFormat } from '../interfaces/image.js';
import { PermitPool } from '../utils/permit-pool.js';
import { imageHttpError } from '../utils/image-http-error.js';

const messageSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    image: z.object({
      format: z.enum(['png', 'bmp']),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      pixels: z.instanceof(Uint8Array),
    }),
  }),
  z.object({
    ok: z.literal(false),
    status: z.union([z.literal(400), z.literal(413), z.literal(415)]),
    message: z.string().max(200),
  }),
]);

@Injectable()
export class ImageDecoderService {
  private readonly pool: PermitPool;
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(IMAGE_WORKER_URL) private readonly workerUrl: URL,
  ) {
    this.pool = new PermitPool(config.UPLOAD_MAX_CONCURRENT);
  }

  async decode(buffer: Buffer, format: ImageFormat): Promise<DecodedImage> {
    const release = this.pool.tryAcquire();
    if (!release)
      throw new ServiceUnavailableException(
        'Image processing capacity is exhausted',
      );
    let worker: Worker;
    try {
      worker = new Worker(this.workerUrl, {
        workerData: { buffer, format, limits: this.config },
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
      return await new Promise<DecodedImage>((resolve, reject) => {
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
          const parsed = messageSchema.safeParse(value);
          if (!parsed.success) {
            reject(
              new ServiceUnavailableException(
                'Invalid image processing response',
              ),
            );
            return;
          }
          const result = parsed.data;
          if (!result.ok) {
            reject(
              imageHttpError(
                new ImageValidationError(result.status, result.message),
              ),
            );
            return;
          }
          const image = result.image;
          if (
            image.format !== format ||
            image.width > this.config.IMAGE_MAX_WIDTH ||
            image.height > this.config.IMAGE_MAX_HEIGHT ||
            image.width * image.height > this.config.IMAGE_MAX_PIXELS ||
            image.pixels.length !== image.width * image.height * 4
          ) {
            reject(
              new ServiceUnavailableException(
                'Invalid image processing response',
              ),
            );
            return;
          }
          resolve(image);
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
