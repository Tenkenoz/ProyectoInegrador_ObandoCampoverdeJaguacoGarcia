import type { Analysis } from '../../database/entities/analysis.entity.js';
import type { AnalysisResultDto } from '../dto/analysis-result.dto.js';

export function mapStoredAnalysis(row: Analysis): AnalysisResultDto {
  return {
    analysis_id: row.id,
    upload_id: row.id,
    user_id: row.userId,
    filename: row.filename,
    original_filename: row.metadata?.original_filename ?? null,
    sha256: row.sha256,
    format: row.metadata?.format ?? null,
    size_bytes: row.metadata?.size_bytes ?? null,
    width: row.metadata?.width ?? null,
    height: row.metadata?.height ?? null,
    status: row.status,
    technique: row.technique,
    reason: row.metadata?.reason ?? null,
    indicators: row.indicators,
    channels: row.metadata?.channels ?? null,
    limitations: row.metadata?.limitations ?? null,
    analyzed_at: row.metadata?.analyzed_at ?? null,
    created_at: row.createdAt.toISOString(),
    detector_parameters: row.metadata?.detector_parameters ?? null,
    action: row.action,
    policy: row.policy,
    quarantine: {
      state: row.quarantineState,
      expires_at: row.quarantineExpiresAt?.toISOString() ?? null,
      deleted_at: row.quarantineDeletedAt?.toISOString() ?? null,
    },
    legacy: row.metadata === null,
  };
}
