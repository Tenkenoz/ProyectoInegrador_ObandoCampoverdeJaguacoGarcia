import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type { DecodedImage, ImageFormat } from '../interfaces/image.js';
import { decodeBmp } from './decode-bmp.js';
import { decodePng } from './decode-png.js';
import { detectImageFormat } from './image-signature.js';

export function decodeImage(
  buffer: Buffer,
  format: ImageFormat,
  limits: UploadConfiguration,
): DecodedImage {
  if (!buffer.length)
    throw new ImageValidationError(400, 'A nonempty image file is required');
  if (buffer.length > limits.UPLOAD_MAX_FILE_BYTES)
    throw new ImageValidationError(
      413,
      'The image exceeds the file size limit',
    );
  if (detectImageFormat(buffer) !== format)
    throw new ImageValidationError(400, 'The image signature is inconsistent');
  return format === 'png'
    ? decodePng(buffer, limits)
    : decodeBmp(buffer, limits);
}
