import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Analysis } from '../database/entities/analysis.entity.js';
import { AuditEvent } from '../database/entities/audit-event.entity.js';
import { sanitizeAudit } from '../audit/utils/sanitize-audit.js';

export type AnalysisDraft = Omit<Analysis, 'createdAt'>;

@Injectable()
export class AnalysisRepository {
  constructor(@InjectDataSource() private readonly database: DataSource) {}

  async create(draft: AnalysisDraft, requestId: string): Promise<Analysis> {
    return this.database.transaction(async (manager) => {
      const analysis = await manager
        .getRepository(Analysis)
        .save(manager.getRepository(Analysis).create(draft));
      const common = {
        requestId,
        subjectId: draft.userId,
        resourceId: draft.id,
        action: 'steganography.analyze' as const,
        outcome:
          draft.status === 'error' ? ('failed' as const) : ('allowed' as const),
        httpStatus: 200,
        details: {
          status: draft.status,
          action: draft.action,
          policy_version: draft.policy?.version,
          quarantine_state: draft.quarantineState,
        },
      };
      await manager
        .getRepository(AuditEvent)
        .insert([
          sanitizeAudit({ ...common, event: 'analysis.completed' }),
          sanitizeAudit({ ...common, event: 'policy.applied' }),
          ...(draft.quarantineState === 'stored'
            ? [sanitizeAudit({ ...common, event: 'quarantine.stored' })]
            : []),
        ]);
      return analysis;
    });
  }

  findById(id: string): Promise<Analysis | null> {
    return this.database.getRepository(Analysis).findOneBy({ id });
  }

  async recordRead(
    id: string,
    subjectId: string,
    requestId: string,
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager
        .getRepository(AuditEvent)
        .insert(
          sanitizeAudit({
            requestId,
            subjectId,
            resourceId: id,
            event: 'analysis.read',
            action: 'steganography.results.read',
            outcome: 'allowed',
            httpStatus: 200,
          }),
        );
    });
  }

  retained(): Promise<Analysis[]> {
    return this.database
      .getRepository(Analysis)
      .createQueryBuilder('analysis')
      .where('analysis.quarantine_state IN (:...states)', {
        states: ['stored', 'missing'],
      })
      .orderBy('analysis.quarantine_expires_at', 'ASC')
      .take(1000)
      .getMany();
  }

  async markFileState(
    id: string,
    state: 'missing' | 'deleted',
    at: Date,
    requestId: string,
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      const row = await manager
        .getRepository(Analysis)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (
        !row ||
        row.quarantineState === 'deleted' ||
        row.quarantineState === state
      )
        return;
      row.quarantineState = state;
      if (state === 'deleted') row.quarantineDeletedAt = at;
      await manager.getRepository(Analysis).save(row);
      await manager
        .getRepository(AuditEvent)
        .insert(
          sanitizeAudit({
            requestId,
            subjectId: row.userId,
            resourceId: id,
            event:
              state === 'deleted' ? 'quarantine.deleted' : 'quarantine.missing',
            outcome: state === 'deleted' ? 'allowed' : 'failed',
          }),
        );
    });
  }
}
