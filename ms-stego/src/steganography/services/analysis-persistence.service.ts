import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../audit/audit.service.js';
import {
  AnalysisRepository,
  type AnalysisDraft,
} from '../../persistence/analysis.repository.js';
import { QuarantineService } from '../../storage/quarantine.service.js';
import type { NewAnalysis } from '../interfaces/new-analysis.js';
import { mapStoredAnalysis } from '../utils/map-stored-analysis.js';

@Injectable()
export class AnalysisPersistenceService {
  constructor(
    @Inject(AnalysisRepository) private readonly repository: AnalysisRepository,
    @Inject(QuarantineService) private readonly quarantine: QuarantineService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async save(input: NewAnalysis, bytes: Buffer, requestId: string) {
    const id = randomUUID();
    const retained = input.policy.action === 'cuarentena';
    const draft: AnalysisDraft = {
      id,
      userId: input.userId,
      filename: `${id}.${input.format}`,
      sha256: input.sha256,
      technique: input.detection.technique,
      indicators: { ...input.detection.indicators },
      status: input.detection.status,
      action: input.policy.action,
      policy: input.policy,
      metadata: {
        original_filename: input.originalFilename,
        format: input.format,
        size_bytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        reason: input.detection.reason,
        channels: input.detection.channels,
        limitations: input.detection.limitations,
        analyzed_at: input.analyzedAt,
        detector_parameters: input.detectorParameters,
      },
      quarantineKey: retained ? id : null,
      quarantineState: retained ? 'stored' : 'none',
      quarantineExpiresAt: retained
        ? new Date(Date.now() + input.policy.retention_seconds! * 1000)
        : null,
      quarantineDeletedAt: null,
    };
    let storageFailed = false;
    const prepare = retained
      ? async () => {
          try {
            await this.quarantine.store(id, bytes);
          } catch {
            storageFailed = true;
            throw new ServiceUnavailableException(
              'Private image storage is unavailable',
            );
          }
        }
      : undefined;
    try {
      const row = await this.repository.create(draft, requestId, prepare);
      this.audit.log({
        requestId,
        subjectId: row.userId,
        resourceId: row.id,
        event: 'analysis.completed',
        outcome: row.status === 'error' ? 'failed' : 'allowed',
        httpStatus: 200,
        details: {
          status: row.status,
          action: row.action,
          policy_version: row.policy?.version,
          quarantine_state: row.quarantineState,
        },
      });
      return mapStoredAnalysis(row);
    } catch {
      if (storageFailed) {
        await this.audit.record({
          requestId,
          subjectId: input.userId,
          resourceId: id,
          event: 'storage.unavailable',
          outcome: 'failed',
          httpStatus: 503,
        });
        throw new ServiceUnavailableException(
          'Private image storage is unavailable',
        );
      }
      let confirmedAbsent = false;
      try {
        const committed = await this.repository.findById(id);
        if (
          committed &&
          committed.userId === draft.userId &&
          committed.sha256 === draft.sha256 &&
          committed.filename === draft.filename &&
          committed.action === draft.action &&
          committed.metadata?.analyzed_at === draft.metadata?.analyzed_at
        )
          return mapStoredAnalysis(committed);
        confirmedAbsent = committed === null;
      } catch {
        confirmedAbsent = false;
      }
      if (retained && confirmedAbsent) {
        try {
          await this.quarantine.remove(id);
        } catch {
          await this.audit.record({
            requestId,
            subjectId: input.userId,
            resourceId: id,
            event: 'storage.compensation_failed',
            outcome: 'failed',
          });
        }
      }
      await this.audit.record({
        requestId,
        subjectId: input.userId,
        resourceId: id,
        event: 'persistence.unavailable',
        outcome: 'failed',
        httpStatus: 503,
      });
      throw new ServiceUnavailableException(
        'Analysis persistence is unavailable',
      );
    }
  }
}
