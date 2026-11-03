import type { UploadConfiguration } from '../config/upload.config.js';
import type { DecodedImage, ImageFormat } from './image.js';

export interface DecoderInput {
  buffer: Uint8Array;
  format: ImageFormat;
  limits: UploadConfiguration;
}

export type DecoderMessage =
  | { ok: true; image: DecodedImage }
  | { ok: false; status: 400 | 413 | 415; message: string };
