import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createBmpFixture,
  createPngFixture,
} from '../../../test/helpers/image-fixture.js';
import { validateUploadConfiguration } from '../config/upload.config.js';
import { ImageWorkerService } from './image-worker.service.js';
import { ImageDecoderService } from './image-decoder.service.js';

const workerUrl = new URL(
  '../../../dist/steganography/workers/image-decoder.worker.js',
  import.meta.url,
);
const limits = validateUploadConfiguration({});

function createDecoder(config = limits, url = workerUrl) {
  return new ImageDecoderService(config, new ImageWorkerService(config, url));
}

describe('Isolated image decoding', () => {
  it('decodes PNG and BMP in real workers', async () => {
    const service = createDecoder(limits, workerUrl);
    for (const [format, image] of [
      ['png', createPngFixture()],
      ['bmp', createBmpFixture()],
    ] as const) {
      const result = await service.decode(image.buffer, format);
      expect(Buffer.from(result.pixels)).toEqual(image.pixels);
    }
  });

  it('maps corrupt images to 400', async () => {
    const service = createDecoder(limits, workerUrl);
    const image = createPngFixture().buffer;
    await expect(
      service.decode(image.subarray(0, 33), 'png'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('terminates workers that exceed the processing deadline', async () => {
    const service = createDecoder(
      { ...limits, IMAGE_DECODE_TIMEOUT_MS: 100 },
      new URL(
        '../../../test/helpers/hanging-image-worker.mjs',
        import.meta.url,
      ),
    );
    await expect(
      service.decode(createPngFixture().buffer, 'png'),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('bounds concurrent workers and releases capacity after timeout', async () => {
    const service = createDecoder(
      { ...limits, IMAGE_DECODE_TIMEOUT_MS: 100, UPLOAD_MAX_CONCURRENT: 1 },
      new URL(
        '../../../test/helpers/hanging-image-worker.mjs',
        import.meta.url,
      ),
    );
    const first = expect(
      service.decode(createPngFixture().buffer, 'png'),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(
      service.decode(createPngFixture().buffer, 'png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await first;
    await expect(
      service.decode(createPngFixture().buffer, 'png'),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects invalid worker output', async () => {
    const service = createDecoder(
      limits,
      new URL(
        '../../../test/helpers/invalid-image-worker.mjs',
        import.meta.url,
      ),
    );
    await expect(
      service.decode(createPngFixture().buffer, 'png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails safely when the worker cannot start', async () => {
    const service = createDecoder(
      limits,
      new URL('file:///missing/stego-image-worker.js'),
    );
    await expect(
      service.decode(createPngFixture().buffer, 'png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
