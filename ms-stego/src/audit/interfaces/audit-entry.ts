export type AuditOutcome = 'allowed' | 'denied' | 'failed';
export type AuditEventName =
  | 'http.request'
  | 'analysis.completed'
  | 'policy.applied'
  | 'analysis.read'
  | 'analysis.denied'
  | 'quarantine.stored'
  | 'quarantine.deleted'
  | 'quarantine.missing'
  | 'quarantine.orphan_deleted'
  | 'storage.compensation_failed'
  | 'storage.unavailable'
  | 'persistence.unavailable';

export interface AuditEntry {
  requestId: string;
  subjectId?: string | null;
  resourceId?: string | null;
  event: AuditEventName;
  action?: 'steganography.analyze' | 'steganography.results.read' | null;
  outcome: AuditOutcome;
  httpStatus?: number | null;
  details?: Record<string, unknown>;
}
