import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  UPLOAD_CONFIG,
  type UploadConfiguration,
} from '../config/upload.config.js';
import { PermitPool } from '../utils/permit-pool.js';

@Injectable()
export class UploadCapacityService {
  private readonly pool: PermitPool;

  constructor(@Inject(UPLOAD_CONFIG) config: UploadConfiguration) {
    this.pool = new PermitPool(config.UPLOAD_MAX_CONCURRENT);
  }

  acquire(): () => void {
    const release = this.pool.tryAcquire();
    if (!release)
      throw new ServiceUnavailableException(
        'Image upload capacity is exhausted',
      );
    return release;
  }
}
