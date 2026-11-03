import { ImageValidationError } from '../errors/image-validation.error.js';
import type { ImageFormat } from '../interfaces/image.js';

export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function detectImageFormat(buffer: Buffer): ImageFormat {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'png';
  if (buffer.length >= 2 && buffer[0] === 66 && buffer[1] === 77) return 'bmp';
  if (
    buffer.length > 0 &&
    buffer.length < 8 &&
    buffer.equals(PNG_SIGNATURE.subarray(0, buffer.length))
  ) {
    throw new ImageValidationError(400, 'The PNG image is truncated');
  }
  throw new ImageValidationError(415, 'The file signature is not PNG or BMP');
}
