import { inflateSync, type Inflate } from 'node:zlib';
import { PNG } from 'pngjs';
import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type { DecodedImage } from '../interfaces/image.js';
import { inspectPng } from './png-structure.js';

export function decodePng(
  buffer: Buffer,
  limits: UploadConfiguration,
): DecodedImage {
  const metadata = inspectPng(buffer, limits);
  try {
    const expected = (metadata.width * metadata.channels + 1) * metadata.height;
    const inflated = inflateSync(metadata.compressed, {
      maxOutputLength: expected,
      info: true,
    }) as unknown as { buffer: Buffer; engine: Inflate };
    if (
      inflated.buffer.length !== expected ||
      inflated.engine.bytesWritten !== metadata.compressed.length
    ) {
      throw new Error('Invalid scanline data');
    }
    const decoded = PNG.sync.read(buffer, { checkCRC: true });
    if (
      decoded.width !== metadata.width ||
      decoded.height !== metadata.height ||
      decoded.data.length !== metadata.width * metadata.height * 4
    ) {
      throw new Error('Inconsistent decoded dimensions');
    }
    return {
      format: 'png',
      width: decoded.width,
      height: decoded.height,
      pixels: decoded.data,
    };
  } catch {
    throw new ImageValidationError(
      400,
      'The PNG image is corrupt or truncated',
    );
  }
}
