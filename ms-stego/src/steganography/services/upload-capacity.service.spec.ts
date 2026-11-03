import { ServiceUnavailableException } from '@nestjs/common';
import { validateUploadConfiguration } from '../config/upload.config.js';
import { UploadCapacityService } from './upload-capacity.service.js';

describe('Upload capacity', () => {
  it('bounds concurrency and releases a permit only once', () => {
    const service = new UploadCapacityService(
      validateUploadConfiguration({ UPLOAD_MAX_CONCURRENT: 1 }),
    );
    const release = service.acquire();
    expect(() => service.acquire()).toThrow(ServiceUnavailableException);
    release();
    release();
    const secondRelease = service.acquire();
    expect(() => service.acquire()).toThrow(ServiceUnavailableException);
    secondRelease();
  });
});
