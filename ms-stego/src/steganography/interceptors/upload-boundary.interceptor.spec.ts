import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, of, throwError } from 'rxjs';
import { validateUploadConfiguration } from '../config/upload.config.js';
import { UploadCapacityService } from '../services/upload-capacity.service.js';
import { UploadBoundaryInterceptor } from './upload-boundary.interceptor.js';

const config = validateUploadConfiguration({ UPLOAD_MAX_CONCURRENT: 1 });

function createContext() {
  const buffer = Buffer.from('private image content');
  const request = {
    headers: {},
    is: () => true,
    file: { buffer },
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context, buffer };
}

describe('Upload lifetime', () => {
  it.each([false, true])(
    'clears in-memory contents and releases capacity on error=%s',
    async (failed) => {
      const capacity = new UploadCapacityService(config);
      const interceptor = new UploadBoundaryInterceptor(config, capacity);
      const fixture = createContext();
      const result = firstValueFrom(
        interceptor.intercept(fixture.context, {
          handle: () =>
            failed
              ? throwError(() => new Error('processing failed'))
              : of('ok'),
        }),
      );
      if (failed) await expect(result).rejects.toThrow('processing failed');
      else await expect(result).resolves.toBe('ok');
      expect(fixture.request.file).toBeUndefined();
      expect(fixture.buffer).toEqual(Buffer.alloc(fixture.buffer.length));
      const release = capacity.acquire();
      release();
    },
  );

  it('cleans up synchronous interceptor failures', () => {
    const capacity = new UploadCapacityService(config);
    const interceptor = new UploadBoundaryInterceptor(config, capacity);
    const fixture = createContext();
    expect(() =>
      interceptor.intercept(fixture.context, {
        handle: () => {
          throw new Error('failed');
        },
      }),
    ).toThrow('failed');
    expect(fixture.request.file).toBeUndefined();
    const release = capacity.acquire();
    release();
  });
});
