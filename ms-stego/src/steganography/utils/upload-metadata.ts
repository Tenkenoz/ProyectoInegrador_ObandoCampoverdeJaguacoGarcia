import { basename, extname } from 'node:path';
import { ImageValidationError } from '../errors/image-validation.error.js';
import type { ImageFormat } from '../interfaces/image.js';

const MIME_FORMATS: Record<string, ImageFormat> = {
  'image/png': 'png',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
};

export function validateUploadMetadata(
  filename: string,
  mime: string,
): ImageFormat {
  if (
    !filename ||
    Buffer.byteLength(filename, 'utf8') > 255 ||
    Array.from(filename).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    filename !== basename(filename.replaceAll('\\', '/'))
  ) {
    throw new ImageValidationError(400, 'Invalid image filename');
  }
  const extension = extname(filename).slice(1).toLowerCase();
  const declared = Object.hasOwn(MIME_FORMATS, mime.toLowerCase())
    ? MIME_FORMATS[mime.toLowerCase()]
    : undefined;
  if ((extension !== 'png' && extension !== 'bmp') || !declared) {
    throw new ImageValidationError(
      415,
      'Only PNG and BMP images are supported',
    );
  }
  if (extension !== declared)
    throw new ImageValidationError(
      400,
      'Image extension and content type do not match',
    );
  return declared;
}
