import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { Analysis } from '../../src/database/entities/analysis.entity.js';
import type { AnalysisDraft } from '../../src/persistence/analysis.repository.js';
import { AnalysisRepository } from '../../src/persistence/analysis.repository.js';
import { AuditRepository } from '../../src/persistence/audit.repository.js';
import type { AuditEntry } from '../../src/audit/interfaces/audit-entry.js';
import { sanitizeAudit } from '../../src/audit/utils/sanitize-audit.js';
import {
  STORAGE_CONFIG,
  validateStorageConfiguration,
} from '../../src/storage/config/storage.config.js';
import { QuarantineScheduler } from '../../src/storage/quarantine-scheduler.js';

export function createPersistenceFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'stego-http-state-'));
  const records = new Map<string, Analysis>();
  const events: ReturnType<typeof sanitizeAudit>[] = [];
  const audit = {
    append: async (entry: AuditEntry) => {
      events.push(sanitizeAudit(entry));
    },
  };
  const analyses = {
    create: async (
      draft: AnalysisDraft,
      requestId: string,
      prepare?: () => Promise<void>,
    ) => {
      await prepare?.();
      const row = Object.assign(new Analysis(), structuredClone(draft), {
        createdAt: new Date(),
      });
      records.set(row.id, row);
      await audit.append({
        requestId,
        subjectId: row.userId,
        resourceId: row.id,
        event: 'analysis.completed',
        outcome: 'allowed',
      });
      return row;
    },
    findById: async (id: string) => records.get(id) ?? null,
    recordRead: async (id: string, subjectId: string, requestId: string) => {
      await audit.append({
        requestId,
        subjectId,
        resourceId: id,
        event: 'analysis.read',
        outcome: 'allowed',
      });
    },
    retained: async () =>
      [...records.values()].filter(
        (row) =>
          row.quarantineState === 'stored' || row.quarantineState === 'missing',
      ),
    removeOrphan: async (
      key: string,
      requestId: string,
      remove: () => Promise<boolean>,
    ) => {
      const row = records.get(key);
      if (row && row.quarantineState !== 'deleted') return false;
      const removed = await remove();
      if (removed)
        await audit.append({
          requestId,
          resourceId: key,
          event: 'quarantine.orphan_deleted',
          outcome: 'allowed',
        });
      return removed;
    },
    markFileState: async (
      id: string,
      state: 'missing' | 'deleted',
      at: Date,
    ) => {
      const row = records.get(id);
      if (!row) return;
      row.quarantineState = state;
      if (state === 'deleted') row.quarantineDeletedAt = at;
    },
  };
  const config = validateStorageConfiguration({ QUARANTINE_DIR: directory });
  return {
    directory,
    records,
    events,
    analyses,
    audit,
    config,
    configure: (builder: TestingModuleBuilder) =>
      builder
        .overrideProvider(AnalysisRepository)
        .useValue(analyses)
        .overrideProvider(AuditRepository)
        .useValue(audit)
        .overrideProvider(STORAGE_CONFIG)
        .useValue(config)
        .overrideProvider(QuarantineScheduler)
        .useValue({}),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
