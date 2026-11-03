import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';

export function validateImageDimensions(
  width: number,
  height: number,
  limits: UploadConfiguration,
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new ImageValidationError(400, 'Invalid image dimensions');
  }
  if (
    width > limits.IMAGE_MAX_WIDTH ||
    height > limits.IMAGE_MAX_HEIGHT ||
    width * height > limits.IMAGE_MAX_PIXELS
  ) {
    throw new ImageValidationError(
      413,
      'The image exceeds the dimension or pixel limit',
    );
  }
}
