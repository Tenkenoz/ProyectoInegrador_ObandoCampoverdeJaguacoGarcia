import { createHash } from 'node:crypto';
import { validateUploadConfiguration } from '../../steganography/config/upload.config.js';
import type { ImageFormat } from '../../steganography/interfaces/image.js';
import { validateLsbConfiguration } from '../../steganography/lsb/config/lsb.config.js';
import { detectLsb } from '../../steganography/lsb/utils/detect-lsb.js';
import { decodeImage } from '../../steganography/utils/decode-image.js';
import type { SampleEvidence } from './sample-evidence.js';
import { deterministicBytes } from './deterministic-bytes.js';
import { encodeBmp, encodePng } from './encode-image.js';
import { embedPayload, recoverPayload } from './payload.js';

export const SAMPLE_MESSAGE =
  'Secure chat STEGO demonstration. This reproducible image contains a known LSB replacement payload.\n';

export function createCoverPixels(
  width: number,
  height: number,
  clearLsb = true,
): Uint8Array {
  const bytes = deterministicBytes('stego-demo-cover-v1', width * height * 3);
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    for (let channel = 0; channel < 3; channel++) {
      const value = bytes[index * 3 + channel]!;
      pixels[index * 4 + channel] = clearLsb ? value & 254 : value;
    }
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

export function createSampleSuite() {
  const width = 128;
  const height = 128;
  const cover = createCoverPixels(width, height);
  const message = Buffer.from(SAMPLE_MESSAGE);
  const embedded = embedPayload(cover, message);
  const recovered = recoverPayload(embedded.pixels);
  if (!recovered.equals(message))
    throw new Error('The known sample payload could not be recovered');
  const limits = validateUploadConfiguration({});
  const detector = validateLsbConfiguration({});
  const files = new Map<string, Buffer>();
  const samples: SampleEvidence[] = [];
  const add = (
    filename: string,
    buffer: Buffer,
    groundTruth: string,
    format?: ImageFormat,
    expectedHttpStatus: SampleEvidence['expected_http_status'] = 200,
  ) => {
    files.set(filename, buffer);
    const image = format ? decodeImage(buffer, format, limits) : undefined;
    const detection = image ? detectLsb(image.pixels, detector) : undefined;
    samples.push({
      filename,
      ground_truth: groundTruth,
      expected_http_status: expectedHttpStatus,
      size_bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      ...(image && detection
        ? { width: image.width, height: image.height, detection }
        : {}),
    });
  };
  for (const format of ['png', 'bmp'] as const) {
    const encode = format === 'png' ? encodePng : encodeBmp;
    add(
      `original.${format}`,
      encode(cover, width, height),
      'synthetic_lsb_biased_cover_without_payload',
      format,
    );
    add(
      `lsb-payload.${format}`,
      encode(embedded.pixels, width, height),
      'known_full_capacity_lsb_replacement_payload',
      format,
    );
  }
  add(
    'noise-control.png',
    encodePng(createCoverPixels(width, height, false), width, height),
    'synthetic_noise_without_embedded_payload',
    'png',
  );
  add(
    'small.png',
    encodePng(createCoverPixels(16, 16), 16, 16),
    'insufficient_pixel_count',
    'png',
  );
  const flat = new Uint8Array(width * height * 4);
  for (let index = 0; index < flat.length; index += 4)
    flat.set([128, 128, 128, 255], index);
  add(
    'flat-control.png',
    encodePng(flat, width, height),
    'insufficient_pair_diversity',
    'png',
  );
  const original = files.get('original.png')!;
  add(
    'corrupt.png',
    original.subarray(0, original.length - 8),
    'truncated_png',
    undefined,
    400,
  );
  add(
    'false-extension.png',
    Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64',
    ),
    'gif_renamed_as_png',
    undefined,
    415,
  );
  files.set('payload.txt', message);
  let changed = 0;
  for (let index = 0; index < cover.length; index++)
    if (index % 4 !== 3 && cover[index] !== embedded.pixels[index]) changed++;
  return {
    files,
    manifest: {
      generator: 'stego_lsb_samples_v1',
      node_version: process.version,
      detector,
      payload: {
        filename: 'payload.txt',
        size_bytes: message.length,
        sha256: createHash('sha256').update(message).digest('hex'),
        recovered_exactly: recovered.equals(message),
        embedded_samples: embedded.embeddedSamples,
        embedding_ratio: embedded.embeddedSamples / (width * height * 3),
        changed_rgb_samples: changed,
      },
      samples,
    },
  };
}
