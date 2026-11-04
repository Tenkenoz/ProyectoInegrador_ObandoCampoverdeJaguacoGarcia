export const AUDIT_DECISIONS = [
  'allowed',
  'denied',
  'succeeded',
  'failed',
] as const;

export type AuditDecision = (typeof AUDIT_DECISIONS)[number];

export interface AuditEventInput {
  eventType: string;
  action: string;
  actorId?: string | null;
  subjectId?: string | null;
  resourceId?: string | null;
  decision?: AuditDecision | null;
  reason?: string | null;
  requestId?: string | null;
}

export interface AuditContext {
  actorId?: string;
  requestId?: string;
}
