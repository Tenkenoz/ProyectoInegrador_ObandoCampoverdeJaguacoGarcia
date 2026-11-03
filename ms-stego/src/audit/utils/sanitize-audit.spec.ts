import { randomUUID } from 'node:crypto';
import { sanitizeAudit } from './sanitize-audit.js';

describe('Audit sanitization', () => {
  it('retains only bounded event metadata and never arbitrary details', () => {
    const record = sanitizeAudit({
      requestId: randomUUID(),
      subjectId: 'Bearer secret',
      resourceId: 'invalid',
      event: 'http.request',
      outcome: 'denied',
      httpStatus: 403,
      details: {
        method: 'POST',
        status: 'sospechoso',
        action: 'cuarentena',
        token: 'private-token',
        password: 'private-password',
        filename: 'private-image.png',
        content: 'image-bytes',
      },
    });
    expect(record.details).toEqual({
      method: 'POST',
      status: 'sospechoso',
      action: 'cuarentena',
    });
    expect(record.subjectId).toBeNull();
    expect(record.resourceId).toBeNull();
    expect(JSON.stringify(record)).not.toContain('private-');
  });
});
