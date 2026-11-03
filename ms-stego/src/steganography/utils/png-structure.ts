import type { UploadConfiguration } from '../config/upload.config.js';
import { ImageValidationError } from '../errors/image-validation.error.js';
import { crc32 } from './crc32.js';
import { validateImageDimensions } from './image-dimensions.js';
import { PNG_SIGNATURE } from './image-signature.js';

export function inspectPng(buffer: Buffer, limits: UploadConfiguration) {
  if (
    buffer.length < 33 ||
    !buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.toString('latin1', 12, 16) !== 'IHDR'
  ) {
    throw new ImageValidationError(400, 'Invalid PNG header');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  validateImageDimensions(width, height, limits);
  const depth = buffer[24];
  const color = buffer[25];
  const interlace = buffer[28];
  if (
    ![1, 2, 4, 8, 16].includes(depth!) ||
    ![0, 2, 3, 4, 6].includes(color!) ||
    buffer[26] !== 0 ||
    buffer[27] !== 0 ||
    (interlace !== 0 && interlace !== 1)
  ) {
    throw new ImageValidationError(400, 'Invalid PNG encoding');
  }
  if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) {
    throw new ImageValidationError(
      415,
      'Only non-interlaced 8-bit RGB or RGBA PNG images are supported',
    );
  }
  const data: Buffer[] = [];
  let offset = 8;
  let chunks = 0;
  let dataEnded = false;
  let paletteSeen = false;
  while (offset < buffer.length) {
    if (++chunks > 2048)
      throw new ImageValidationError(413, 'The PNG chunk limit was exceeded');
    if (buffer.length - offset < 12)
      throw new ImageValidationError(400, 'The PNG chunk is truncated');
    const size = buffer.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > buffer.length)
      throw new ImageValidationError(400, 'The PNG chunk is truncated');
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      type[2] !== type[2]!.toUpperCase() ||
      crc32(buffer.subarray(offset + 4, end - 4)) !==
        buffer.readUInt32BE(end - 4)
    ) {
      throw new ImageValidationError(400, 'Invalid PNG chunk or checksum');
    }
    if (type === 'IHDR' && offset !== 8)
      throw new ImageValidationError(400, 'Duplicate PNG header');
    if (['acTL', 'fcTL', 'fdAT', 'tRNS'].includes(type)) {
      throw new ImageValidationError(
        415,
        'Animated PNG and transparency-key chunks are not supported',
      );
    }
    if (type === 'PLTE') {
      if (
        paletteSeen ||
        data.length ||
        size === 0 ||
        size > 768 ||
        size % 3 !== 0
      ) {
        throw new ImageValidationError(400, 'Invalid PNG palette');
      }
      paletteSeen = true;
    }
    if (type === 'IDAT') {
      if (dataEnded)
        throw new ImageValidationError(
          400,
          'PNG image data must be consecutive',
        );
      data.push(buffer.subarray(offset + 8, end - 4));
    } else if (data.length) dataEnded = true;
    if (type === 'IEND') {
      if (size !== 0 || end !== buffer.length || !data.length)
        throw new ImageValidationError(400, 'Invalid PNG end marker');
      return {
        width,
        height,
        channels: color === 6 ? 4 : 3,
        compressed: Buffer.concat(data),
      };
    }
    if (
      type[0] === type[0]!.toUpperCase() &&
      !['IHDR', 'PLTE', 'IDAT'].includes(type)
    ) {
      throw new ImageValidationError(415, 'Unsupported critical PNG chunk');
    }
    offset = end;
  }
  throw new ImageValidationError(400, 'The PNG end marker is missing');
}
