import { ServiceUnavailableException } from '@nestjs/common';
import { createLsbFixture } from '../../../test/helpers/lsb-fixture.js';
import { validateUploadConfiguration } from '../config/upload.config.js';
import { ImageWorkerService } from '../services/image-worker.service.js';
import { validateLsbConfiguration } from './config/lsb.config.js';
import { LsbDetectorService } from './lsb-detector.service.js';

const limits = validateUploadConfiguration({});
const config = validateLsbConfiguration({});
const workerUrl = new URL(
  '../../../dist/steganography/workers/image-decoder.worker.js',
  import.meta.url,
);

describe('Isolated LSB analysis', () => {
  it.each([true, false])(
    'decodes and analyzes RGB samples in the worker with balanced=%s',
    async (balanced) => {
      const service = new LsbDetectorService(
        limits,
        config,
        new ImageWorkerService(limits, workerUrl),
      );
      const result = await service.analyze(
        createLsbFixture(balanced).buffer,
        'png',
      );
      expect(result.detection.status).toBe(
        balanced ? 'sospechoso' : 'sin_indicios',
      );
      expect(result.detection.indicators.pixel_count).toBe(4096);
      expect(result).not.toHaveProperty('pixels');
    },
  );

  it('rejects an incomplete analysis response instead of fabricating evidence', async () => {
    const service = new LsbDetectorService(
      limits,
      config,
      new ImageWorkerService(
        limits,
        new URL(
          '../../../test/helpers/invalid-image-worker.mjs',
          import.meta.url,
        ),
      ),
    );
    await expect(
      service.analyze(createLsbFixture(true).buffer, 'png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
