import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { AuditEntry } from './interfaces/audit-entry.js';
import { sanitizeAudit } from './utils/sanitize-audit.js';
import { AuditRepository } from '../persistence/audit.repository.js';

@Injectable()
export class AuditService implements OnModuleDestroy {
  private readonly logger = new Logger('SecurityAudit');
  private readonly pending = new Set<Promise<void>>();
  constructor(
    @Inject(AuditRepository) private readonly repository: AuditRepository,
  ) {}

  log(entry: AuditEntry): void {
    this.logger.log(
      JSON.stringify({
        ...sanitizeAudit(entry),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  async record(entry: AuditEntry, required = false): Promise<void> {
    this.log(entry);
    if (this.pending.size >= 32) {
      this.logger.error(
        JSON.stringify({
          event: 'audit.persistence_capacity',
          requestId: entry.requestId,
        }),
      );
      if (required) throw new Error('Audit persistence is unavailable');
      return;
    }
    const task = this.repository.append(sanitizeAudit(entry));
    this.pending.add(task);
    try {
      await task;
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'audit.persistence_unavailable',
          requestId: entry.requestId,
        }),
      );
      if (required) throw new Error('Audit persistence is unavailable');
    } finally {
      this.pending.delete(task);
    }
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.pending);
  }
  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
