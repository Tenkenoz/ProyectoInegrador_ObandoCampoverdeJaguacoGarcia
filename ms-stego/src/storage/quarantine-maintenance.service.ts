import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AnalysisRepository } from '../persistence/analysis.repository.js';
import { AuditService } from '../audit/audit.service.js';
import {
  STORAGE_CONFIG,
  type StorageConfiguration,
} from './config/storage.config.js';
import { QuarantineService } from './quarantine.service.js';

@Injectable()
export class QuarantineMaintenanceService {
  private pending?: Promise<{
    deleted: number;
    missing: number;
    orphans: number;
  }>;
  constructor(
    @Inject(AnalysisRepository) private readonly analyses: AnalysisRepository,
    @Inject(QuarantineService) private readonly files: QuarantineService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfiguration,
  ) {}

  sweep(now = new Date()) {
    if (this.pending) return this.pending;
    this.pending = this.reconcile(now).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async reconcile(now: Date) {
    const requestId = randomUUID();
    const report = { deleted: 0, missing: 0, orphans: 0 };
    const inventory = new Map(
      (await this.files.files()).map((file) => [file.key, file]),
    );
    for (const row of await this.analyses.retained()) {
      if (!row.quarantineKey || !row.quarantineExpiresAt) continue;
      if (row.quarantineExpiresAt <= now) {
        await this.files.remove(row.quarantineKey);
        await this.analyses.markFileState(row.id, 'deleted', now, requestId);
        this.audit.log({
          requestId,
          subjectId: row.userId,
          resourceId: row.id,
          event: 'quarantine.deleted',
          outcome: 'allowed',
        });
        inventory.delete(row.quarantineKey);
        report.deleted++;
      } else if (
        !inventory.has(row.quarantineKey) &&
        row.quarantineState === 'stored' &&
        !(await this.files.exists(row.quarantineKey))
      ) {
        await this.analyses.markFileState(row.id, 'missing', now, requestId);
        this.audit.log({
          requestId,
          subjectId: row.userId,
          resourceId: row.id,
          event: 'quarantine.missing',
          outcome: 'failed',
        });
        report.missing++;
      }
    }
    for (const file of inventory.values()) {
      if (
        now.getTime() - file.modifiedAt.getTime() <
        this.config.QUARANTINE_ORPHAN_GRACE_SECONDS * 1000
      )
        continue;
      const removed = await this.analyses.removeOrphan(
        file.key,
        requestId,
        () => this.files.remove(file.key),
      );
      if (removed) {
        this.audit.log({
          requestId,
          resourceId: file.key,
          event: 'quarantine.orphan_deleted',
          outcome: 'allowed',
        });
        report.orphans++;
      }
    }
    return report;
  }
}
