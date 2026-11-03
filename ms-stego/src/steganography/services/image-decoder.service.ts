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
import type { DecodedImage, ImageFormat } from '../interfaces/image.js';
import { ImageWorkerService } from './image-worker.service.js';

const messageSchema = z.object({
  ok: z.literal(true),
  image: z.object({
    format: z.enum(['png', 'bmp']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixels: z.instanceof(Uint8Array),
  }),
});

@Injectable()
export class ImageDecoderService {
  constructor(
    @Inject(UPLOAD_CONFIG) private readonly config: UploadConfiguration,
    @Inject(ImageWorkerService) private readonly worker: ImageWorkerService,
  ) {}

  async decode(buffer: Buffer, format: ImageFormat): Promise<DecodedImage> {
    const parsed = messageSchema.safeParse(
      await this.worker.execute(buffer, format),
    );
    if (!parsed.success)
      throw new ServiceUnavailableException(
        'Invalid image processing response',
      );
    const image = parsed.data.image;
    if (
      image.format !== format ||
      image.width > this.config.IMAGE_MAX_WIDTH ||
      image.height > this.config.IMAGE_MAX_HEIGHT ||
      image.width * image.height > this.config.IMAGE_MAX_PIXELS ||
      image.pixels.length !== image.width * image.height * 4
    ) {
      throw new ServiceUnavailableException(
        'Invalid image processing response',
      );
    }
    return image;
  }
}
