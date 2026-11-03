import { createHash } from 'node:crypto';
import { validateUploadConfiguration } from '../../steganography/config/upload.config.js';
import { decodeImage } from '../../steganography/utils/decode-image.js';
import {
  createCoverPixels,
  createSampleSuite,
  SAMPLE_MESSAGE,
} from './sample-suite.js';
import { embedPayload, recoverPayload } from './payload.js';

const limits = validateUploadConfiguration({});

describe('Reproducible LSB samples', () => {
  it('generates identical bytes and evidence on repeated runs', () => {
    const first = createSampleSuite();
    const second = createSampleSuite();
    expect(first.manifest).toEqual(second.manifest);
    for (const [filename, buffer] of first.files)
      expect(second.files.get(filename)).toEqual(buffer);
  });

  it('embeds a real recoverable message with only one-bit RGB changes', () => {
    const cover = createCoverPixels(128, 128);
    const embedded = embedPayload(cover, Buffer.from(SAMPLE_MESSAGE));
    expect(recoverPayload(embedded.pixels).toString()).toBe(SAMPLE_MESSAGE);
    expect(embedded.embeddedSamples).toBe(128 * 128 * 3);
    for (let index = 0; index < cover.length; index++) {
      expect(
        Math.abs(cover[index]! - embedded.pixels[index]!),
      ).toBeLessThanOrEqual(1);
      if (index % 4 === 3) expect(embedded.pixels[index]).toBe(cover[index]);
    }
  });

  it('preserves the known payload through PNG and BMP encoding', () => {
    const suite = createSampleSuite();
    for (const format of ['png', 'bmp'] as const) {
      const decoded = decodeImage(
        suite.files.get(`lsb-payload.${format}`)!,
        format,
        limits,
      );
      expect(recoverPayload(decoded.pixels).toString()).toBe(SAMPLE_MESSAGE);
    }
    for (const sample of suite.manifest.samples) {
      expect(
        createHash('sha256')
          .update(suite.files.get(sample.filename)!)
          .digest('hex'),
      ).toBe(sample.sha256);
    }
  });

  it('rejects insufficient capacity and damaged payloads', () => {
    expect(() =>
      embedPayload(new Uint8Array(16), Buffer.from(SAMPLE_MESSAGE)),
    ).toThrow(RangeError);
    const embedded = embedPayload(
      createCoverPixels(128, 128),
      Buffer.from(SAMPLE_MESSAGE),
    );
    embedded.pixels[400] = embedded.pixels[400]! ^ 1;
    expect(() => recoverPayload(embedded.pixels)).toThrow();
  });
});
