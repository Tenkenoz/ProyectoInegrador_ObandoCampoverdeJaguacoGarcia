import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_CONFIG,
  type StorageConfiguration,
} from '../../storage/config/storage.config.js';
import type { LsbStatus } from '../lsb/interfaces/lsb-result.js';
import {
  POLICY_CONFIG,
  type PolicyConfiguration,
} from './config/policy.config.js';
import { selectPolicy } from './utils/select-policy.js';

@Injectable()
export class PolicyService {
  constructor(
    @Inject(POLICY_CONFIG) private readonly config: PolicyConfiguration,
    @Inject(STORAGE_CONFIG) private readonly storage: StorageConfiguration,
  ) {}

  evaluate(status: LsbStatus) {
    return selectPolicy(
      status,
      this.config,
      this.storage.QUARANTINE_RETENTION_SECONDS,
    );
  }
}
