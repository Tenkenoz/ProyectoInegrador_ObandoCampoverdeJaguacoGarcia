import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ImageValidationError } from '../errors/image-validation.error.js';

export function imageHttpError(error: ImageValidationError) {
  if (error.status === 413) return new PayloadTooLargeException(error.message);
  if (error.status === 415)
    return new UnsupportedMediaTypeException(error.message);
  return new BadRequestException(error.message);
}
