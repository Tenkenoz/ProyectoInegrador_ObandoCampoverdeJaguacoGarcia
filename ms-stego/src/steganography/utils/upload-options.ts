import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import { imageHttpError } from './image-http-error.js';
import { validateUploadMetadata } from './upload-metadata.js';

export function createUploadOptions(
  config: UploadConfiguration,
): MulterOptions {
  return {
    limits: {
      fileSize: config.UPLOAD_MAX_FILE_BYTES + 1,
      files: 1,
      fields: 0,
      parts: 2,
      fieldNameSize: 32,
      headerPairs: 32,
    },
    fileFilter: (_request, file, callback) => {
      try {
        validateUploadMetadata(file.originalname, file.mimetype);
        callback(null, true);
      } catch (error) {
        callback(
          error instanceof ImageValidationError
            ? imageHttpError(error)
            : new Error('Invalid file metadata'),
          false,
        );
      }
    },
  };
}
