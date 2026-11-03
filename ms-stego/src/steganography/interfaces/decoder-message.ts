import type { LsbConfiguration } from '../lsb/config/lsb.config.js';
import type { LsbResult } from '../lsb/interfaces/lsb-result.js';
import type { UploadConfiguration } from '../config/upload.config.js';
import type { DecodedImage, ImageFormat } from './image.js';

export interface DecoderInput {
  buffer: Uint8Array;
  format: ImageFormat;
  limits: UploadConfiguration;
  detectorConfig?: LsbConfiguration;
}

export type DecoderMessage =
  | { ok: true; image: DecodedImage }
  | { ok: true; image: Omit<DecodedImage, 'pixels'>; detection: LsbResult }
  | { ok: false; status: 400 | 413 | 415; message: string };
