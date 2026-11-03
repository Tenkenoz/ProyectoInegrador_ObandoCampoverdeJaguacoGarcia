import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type { ImageUpload } from '../interfaces/image.js';
import { detectImageFormat } from './image-signature.js';
import { validateUploadMetadata } from './upload-metadata.js';

export function validateUpload(
  file: ImageUpload | undefined,
  limits: UploadConfiguration,
) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw new ImageValidationError(400, 'A nonempty image file is required');
  }
  if (file.buffer.length > limits.UPLOAD_MAX_FILE_BYTES)
    throw new ImageValidationError(
      413,
      'The image exceeds the file size limit',
    );
  if (file.size !== file.buffer.length)
    throw new ImageValidationError(400, 'The image size is inconsistent');
  const declared = validateUploadMetadata(file.originalname, file.mimetype);
  const detected = detectImageFormat(file.buffer);
  if (declared !== detected)
    throw new ImageValidationError(
      400,
      'The image signature does not match its declared format',
    );
  return detected;
}
