import { validateUploadConfiguration } from './upload.config.js';

describe('Upload configuration', () => {
  it('sets bounded defaults', () => {
    expect(validateUploadConfiguration({})).toEqual({
      UPLOAD_MAX_FILE_BYTES: 5242880,
      IMAGE_MAX_WIDTH: 4096,
      IMAGE_MAX_HEIGHT: 4096,
      IMAGE_MAX_PIXELS: 4000000,
      IMAGE_DECODE_TIMEOUT_MS: 3000,
      UPLOAD_MAX_CONCURRENT: 2,
    });
  });

  it.each([
    { UPLOAD_MAX_FILE_BYTES: 0 },
    { UPLOAD_MAX_FILE_BYTES: 20971521 },
    { IMAGE_MAX_WIDTH: 'invalid' },
    { IMAGE_MAX_HEIGHT: -1 },
    { IMAGE_MAX_PIXELS: 16000001 },
    { IMAGE_DECODE_TIMEOUT_MS: 99 },
    { UPLOAD_MAX_CONCURRENT: 5 },
    { UPLOAD_MAX_CONCURRENT: 1.5 },
  ])('rejects unsafe settings %j', (values) => {
    expect(() => validateUploadConfiguration(values)).toThrow(
      'Invalid upload configuration',
    );
  });
});
