import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import {
  STORAGE_CONFIG,
  type StorageConfiguration,
} from './config/storage.config.js';
import { QuarantineMaintenanceService } from './quarantine-maintenance.service.js';

@Injectable()
export class QuarantineScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(
    @Inject(QuarantineMaintenanceService)
    private readonly maintenance: QuarantineMaintenanceService,
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfiguration,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, this.config.QUARANTINE_CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  private run(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.maintenance
      .sweep()
      .then(() => undefined)
      .catch(() => {
        this.audit.log({
          requestId: randomUUID(),
          event: 'storage.unavailable',
          outcome: 'failed',
        });
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
}
