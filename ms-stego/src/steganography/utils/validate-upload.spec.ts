import { validateUploadConfiguration } from '../config/upload.config.js';
import type { ImageUpload } from '../interfaces/image.js';
import { PNG_SIGNATURE } from './image-signature.js';
import { validateImageDimensions } from './image-dimensions.js';
import { validateUpload } from './validate-upload.js';
import { validateUploadMetadata } from './upload-metadata.js';

const limits = validateUploadConfiguration({});
const image: ImageUpload = {
  originalname: 'image.png',
  mimetype: 'image/png',
  size: 8,
  buffer: PNG_SIGNATURE,
};

function expectStatus(callback: () => unknown, status: number) {
  try {
    callback();
    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toMatchObject({ status });
  }
}

describe('Upload validation', () => {
  it('accepts PNG and common BMP MIME types', () => {
    expect(validateUpload(image, limits)).toBe('png');
    expect(validateUploadMetadata('image.PNG', 'IMAGE/PNG')).toBe('png');
    expect(validateUploadMetadata('image.bmp', 'image/bmp')).toBe('bmp');
    expect(validateUploadMetadata('image.bmp', 'image/x-ms-bmp')).toBe('bmp');
  });

  it.each([
    ['image.jpg', 'image/jpeg'],
    ['image.png', 'application/octet-stream'],
    ['image.svg', 'image/png'],
    ['image', 'image/png'],
  ])('rejects unsupported metadata %s', (filename, mime) => {
    expectStatus(() => validateUploadMetadata(filename, mime), 415);
  });

  it.each([
    '../image.png',
    'folder/image.png',
    'folder\\image.png',
    'bad\0.png',
    'x'.repeat(256) + '.png',
  ])('rejects unsafe filenames', (filename) => {
    expectStatus(() => validateUploadMetadata(filename, 'image/png'), 400);
  });

  it('rejects contradictory supported metadata and signatures', () => {
    expectStatus(() => validateUploadMetadata('image.png', 'image/bmp'), 400);
    expectStatus(
      () =>
        validateUpload({ ...image, buffer: Buffer.from('BM123456') }, limits),
      400,
    );
  });

  it('rejects missing, empty, oversized and inconsistent files', () => {
    expectStatus(() => validateUpload(undefined, limits), 400);
    expectStatus(
      () =>
        validateUpload({ ...image, buffer: Buffer.alloc(0), size: 0 }, limits),
      400,
    );
    expectStatus(
      () => validateUpload(image, { ...limits, UPLOAD_MAX_FILE_BYTES: 7 }),
      413,
    );
    expectStatus(() => validateUpload({ ...image, size: 7 }, limits), 400);
  });

  it('rejects forged signatures and truncated PNG signatures', () => {
    expectStatus(
      () =>
        validateUpload({ ...image, buffer: Buffer.from('notimage') }, limits),
      415,
    );
    expectStatus(
      () =>
        validateUpload(
          { ...image, size: 4, buffer: PNG_SIGNATURE.subarray(0, 4) },
          limits,
        ),
      400,
    );
  });
});

describe('Image dimension limits', () => {
  it('accepts the exact pixel limit', () => {
    expect(() => validateImageDimensions(2000, 2000, limits)).not.toThrow();
  });

  it.each([
    [0, 1],
    [1, -1],
    [1.5, 1],
  ])('rejects invalid dimensions', (width, height) => {
    expectStatus(() => validateImageDimensions(width, height, limits), 400);
  });

  it.each([
    [4097, 1],
    [1, 4097],
    [2001, 2000],
  ])('rejects excessive dimensions or pixels', (width, height) => {
    expectStatus(() => validateImageDimensions(width, height, limits), 413);
  });
});
