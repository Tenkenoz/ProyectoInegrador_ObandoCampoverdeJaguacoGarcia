import { z } from 'zod';
import type { AuditEntry } from '../interfaces/audit-entry.js';

const safeDetails = new Set([
  'method',
  'status',
  'action',
  'policy_version',
  'quarantine_state',
  'missing',
  'legacy',
]);
const methods = new Set([
  'GET',
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const statuses = new Set([
  'sin_indicios',
  'sospechoso',
  'no_concluyente',
  'error',
]);
const actions = new Set(['advertencia', 'cuarentena', 'rechazo']);
const states = new Set(['none', 'stored', 'deleted', 'missing']);

export function sanitizeAudit(entry: AuditEntry) {
  const details: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(entry.details ?? {})) {
    if (!safeDetails.has(key)) continue;
    if (key === 'method' && typeof value === 'string')
      details[key] = methods.has(value) ? value : 'OTHER';
    if (key === 'status' && typeof value === 'string' && statuses.has(value))
      details[key] = value;
    if (key === 'action' && typeof value === 'string' && actions.has(value))
      details[key] = value;
    if (
      key === 'quarantine_state' &&
      typeof value === 'string' &&
      states.has(value)
    )
      details[key] = value;
    if (key === 'policy_version' && value === 'stego_policy_v1')
      details[key] = value;
    if ((key === 'missing' || key === 'legacy') && typeof value === 'boolean')
      details[key] = value;
  }
  return {
    requestId: z.uuid().parse(entry.requestId),
    subjectId: z.uuid().safeParse(entry.subjectId).data ?? null,
    resourceId: z.uuid().safeParse(entry.resourceId).data ?? null,
    event: entry.event,
    action: entry.action ?? null,
    outcome: entry.outcome,
    httpStatus:
      Number.isInteger(entry.httpStatus) &&
      entry.httpStatus! >= 100 &&
      entry.httpStatus! <= 599
        ? entry.httpStatus!
        : null,
    details,
  };
}
