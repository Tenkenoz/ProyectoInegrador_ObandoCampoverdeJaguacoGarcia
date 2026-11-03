import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type { DecodedImage } from '../interfaces/image.js';
import { validateImageDimensions } from './image-dimensions.js';

export function decodeBmp(
  buffer: Buffer,
  limits: UploadConfiguration,
): DecodedImage {
  if (buffer.length < 18 || buffer.toString('latin1', 0, 2) !== 'BM')
    throw new ImageValidationError(400, 'Invalid BMP header');
  if (buffer.readUInt32LE(14) !== 40)
    throw new ImageValidationError(
      415,
      'Only BITMAPINFOHEADER BMP images are supported',
    );
  if (buffer.length < 54)
    throw new ImageValidationError(400, 'The BMP header is truncated');
  const width = buffer.readInt32LE(18);
  const signedHeight = buffer.readInt32LE(22);
  const height = Math.abs(signedHeight);
  validateImageDimensions(width, height, limits);
  const bits = buffer.readUInt16LE(28);
  if (buffer.readUInt16LE(26) !== 1)
    throw new ImageValidationError(400, 'Invalid BMP plane count');
  if (
    (bits !== 24 && bits !== 32) ||
    buffer.readUInt32LE(30) !== 0 ||
    buffer.readUInt32LE(46) !== 0
  ) {
    throw new ImageValidationError(
      415,
      'Only uncompressed 24-bit or 32-bit RGB BMP images are supported',
    );
  }
  const offset = buffer.readUInt32LE(10);
  const stride = Math.ceil((width * bits) / 32) * 4;
  const bytes = stride * height;
  const declaredBytes = buffer.readUInt32LE(34);
  if (
    offset !== 54 ||
    buffer.readUInt32LE(2) !== buffer.length ||
    buffer.readUInt32LE(6) !== 0 ||
    buffer.length !== offset + bytes ||
    (declaredBytes !== 0 && declaredBytes !== bytes)
  ) {
    throw new ImageValidationError(
      400,
      'The BMP pixel data or file size is inconsistent',
    );
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = signedHeight > 0 ? height - y - 1 : y;
    for (let x = 0; x < width; x++) {
      const source = offset + row * stride + x * (bits / 8);
      const target = (y * width + x) * 4;
      pixels[target] = buffer[source + 2]!;
      pixels[target + 1] = buffer[source + 1]!;
      pixels[target + 2] = buffer[source]!;
      pixels[target + 3] = 255;
    }
  }
  return { format: 'bmp', width, height, pixels };
}
