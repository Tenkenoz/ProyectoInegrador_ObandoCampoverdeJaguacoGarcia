import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import request, { type Response } from 'supertest';
import { AuditService } from '../../src/audit/audit.service.js';
import { Analysis } from '../../src/database/entities/analysis.entity.js';
import { AuditEvent } from '../../src/database/entities/audit-event.entity.js';
import { validateUploadConfiguration } from '../../src/steganography/config/upload.config.js';
import {
  sourceFingerprint,
  writeDeliveryArtifact,
} from '../helpers/delivery-artifacts.js';
import { createDeliveryFixture } from '../helpers/delivery-fixture.js';

interface EvidenceCase {
  id: string;
  scenario: string;
  request: {
    method: string;
    path: string;
    credentials: string;
    sample?: string;
  };
  expected_http_status: number;
  actual_http_status: number;
  request_id: string;
  response: unknown;
}

describe('Local STEGO delivery evidence with a simulated AUTH service', () => {
  let fixture: Awaited<ReturnType<typeof createDeliveryFixture>>;
  beforeAll(async () => {
    fixture = await createDeliveryFixture();
  });
  afterAll(async () => {
    await fixture?.dispose();
  });

  it('records T03, T04, T07, T09, T10, T11 and T12 without publishing credentials', async () => {
    const startedAt = new Date().toISOString();
    const cases: EvidenceCase[] = [];
    const token = await fixture.auth.signing.issue();
    const manifest = JSON.parse(
      await readFile('samples/manifest.json', 'utf8'),
    ) as {
      samples: {
        filename: string;
        sha256: string;
        expected_http_status: number;
        detection?: {
          status: string;
          indicators: Record<string, number | null>;
        };
      }[];
    };
    const server = fixture.app.getHttpServer();
    const base = '/api/v1/steganography';
    const sample = await readFile('samples/lsb-payload.png');
    const upload = (
      access: string | null,
      bytes = sample,
      filename = 'lsb-payload.png',
      path = `${base}/analyze`,
    ) => {
      const operation = request(server).post(path);
      if (access !== null) operation.set('Authorization', `Bearer ${access}`);
      return operation.attach('file', bytes, {
        filename,
        contentType: filename.endsWith('.bmp') ? 'image/bmp' : 'image/png',
      });
    };
    const record = (
      id: string,
      scenario: string,
      response: Response,
      expected: number,
      credentials = 'valid_fixture_token',
      path = `${base}/analyze`,
      method = 'POST',
      filename?: string,
    ) => {
      expect(response.status, scenario).toBe(expected);
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
      cases.push({
        id,
        scenario,
        request: {
          method,
          path,
          credentials,
          ...(filename ? { sample: filename } : {}),
        },
        expected_http_status: expected,
        actual_http_status: response.status,
        request_id: response.headers['x-request-id'] as string,
        response: response.body,
      });
    };
    const count = () => fixture.database.getRepository(Analysis).count();

    record('T03', 'Missing access token', await upload(null), 401, 'absent');
    const [header, payload, signature] = token.split('.') as [
      string,
      string,
      string,
    ];
    const altered = `${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    record(
      'T03',
      'Tampered signature',
      await upload(altered),
      401,
      'tampered_fixture_token',
    );
    const expired = await fixture.auth.signing.issue({
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    record(
      'T03',
      'Expired access token',
      await upload(expired),
      401,
      'expired_fixture_token',
    );
    expect(await count()).toBe(0);

    fixture.auth.state.mode = 'deny';
    record(
      'T04',
      'AUTH fixture denies analysis permission; no real USER role is created',
      await upload(token),
      403,
    );
    expect(await count()).toBe(0);
    fixture.auth.state.mode = 'allow';
    record(
      'T07',
      'Permission granted before simulated role removal',
      await upload(token),
      200,
    );
    const beforeRevoke = await count();
    fixture.auth.state.mode = 'deny';
    record(
      'T07',
      'Same access token denied after AUTH fixture decision changes',
      await upload(token),
      403,
    );
    expect(await count()).toBe(beforeRevoke);
    fixture.auth.state.mode = 'unavailable';
    record(
      'AUTH_OUTAGE',
      'AUTH fixture unavailable; processing fails closed',
      await upload(token),
      503,
    );
    expect(await count()).toBe(beforeRevoke);
    fixture.auth.state.mode = 'allow';

    let ownedId = '';
    for (const entry of manifest.samples) {
      const bytes = await readFile(`samples/${entry.filename}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        entry.sha256,
      );
      const response = await upload(token, bytes, entry.filename);
      record(
        entry.expected_http_status === 200 ? 'T09' : 'T10',
        `Committed sample: ${entry.filename}`,
        response,
        entry.expected_http_status,
        'valid_fixture_token',
        `${base}/analyze`,
        'POST',
        entry.filename,
      );
      if (entry.expected_http_status !== 200) continue;
      expect(response.body.sha256).toBe(entry.sha256);
      expect(response.body.status).toBe(entry.detection!.status);
      for (const [metric, value] of Object.entries(
        entry.detection!.indicators,
      )) {
        if (value === null) expect(response.body.indicators[metric]).toBeNull();
        else expect(response.body.indicators[metric]).toBeCloseTo(value, 10);
      }
      if (entry.filename === 'lsb-payload.png')
        ownedId = response.body.analysis_id as string;
    }
    expect(ownedId).not.toBe('');
    const limit = validateUploadConfiguration({}).UPLOAD_MAX_FILE_BYTES;
    record(
      'T10',
      'File exceeds the configured byte limit',
      await upload(token, Buffer.alloc(limit + 1), 'oversized.png'),
      413,
    );
    record(
      'T10',
      'Multipart request has no file',
      await request(server)
        .post(`${base}/analyze`)
        .set('Authorization', `Bearer ${token}`)
        .field('unused', 'value'),
      400,
    );

    const resultPath = `${base}/results/${ownedId}`;
    record(
      'T11',
      'Owner retrieves the persisted analysis',
      await request(server)
        .get(resultPath)
        .set('Authorization', `Bearer ${token}`),
      200,
      'valid_fixture_token',
      resultPath,
      'GET',
    );
    const analyses = fixture.database.getRepository(Analysis);
    await analyses.update(ownedId, { userId: randomUUID() });
    record(
      'T11',
      'Own scope cannot read another subject analysis',
      await request(server)
        .get(resultPath)
        .set('Authorization', `Bearer ${token}`),
      403,
      'valid_fixture_token',
      resultPath,
      'GET',
    );
    fixture.auth.state.scope = 'any';
    record(
      'T11',
      'AUTH fixture grants ADMIN-style any scope',
      await request(server)
        .get(resultPath)
        .set('Authorization', `Bearer ${token}`),
      200,
      'valid_fixture_token',
      resultPath,
      'GET',
    );
    fixture.auth.state.scope = 'own';

    const queryProbe = 'evidence-query-secret';
    const headerProbe = 'evidence-header-secret';
    const probe = await request(server)
      .post(`${base}/analyze?probe=${queryProbe}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Evidence-Probe', headerProbe)
      .attach('file', sample, {
        filename: 'lsb-payload.png',
        contentType: 'image/png',
      });
    record(
      'T12',
      'Audit excludes token, headers, query strings and original filename',
      probe,
      200,
    );
    await fixture.app.get(AuditService).flush();
    const events = await fixture.database
      .getRepository(AuditEvent)
      .find({ order: { createdAt: 'ASC', id: 'ASC' } });
    const audit = events.map((event) => ({
      created_at: event.createdAt.toISOString(),
      request_id: event.requestId,
      subject_id: event.subjectId,
      resource_id: event.resourceId,
      event: event.event,
      action: event.action,
      outcome: event.outcome,
      http_status: event.httpStatus,
      details: event.details,
    }));
    const serializedAudit = JSON.stringify(audit);
    for (const forbidden of [
      token,
      altered,
      expired,
      queryProbe,
      headerProbe,
      'lsb-payload.png',
      fixture.auth.config.AUTH_SERVICE_SECRET,
    ])
      expect(serializedAudit).not.toContain(forbidden);
    for (const entry of cases)
      expect(
        audit.some(
          (event) =>
            event.request_id === entry.request_id &&
            event.event === 'http.request' &&
            event.http_status === entry.actual_http_status,
        ),
      ).toBe(true);
    for (const name of [
      'analysis.completed',
      'policy.applied',
      'quarantine.stored',
      'analysis.read',
      'analysis.denied',
    ])
      expect(
        audit.some((event) => event.event === name),
        name,
      ).toBe(true);
    const files = await readdir(fixture.directory);
    const retained = await analyses.find({
      where: { quarantineState: 'stored' },
    });
    expect(files).toHaveLength(retained.length);
    for (const row of retained) {
      const bytes = await readFile(
        `${fixture.directory}/${row.quarantineKey}.bin`,
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
    }
    expect(fixture.auth.state.validSignatures).toBeGreaterThan(0);
    const sql = await readFile('docs/evidence/audit-review.sql', 'utf8');
    await fixture.database.query(
      sql.replaceAll(":'analysis_id'", `'${ownedId}'`),
    );
    expect(await count()).toBe(
      cases.filter(
        (entry) =>
          entry.request.method === 'POST' && entry.actual_http_status === 200,
      ).length,
    );
    const report = {
      evidence_kind: 'local_fixture',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      environment: {
        node: process.version,
        database: 'isolated PostgreSQL 17 Docker container',
        auth: 'temporary HTTPS fixture with RSA JWT, JWKS and HMAC',
        policy: 'default configuration',
        scheduler:
          'disabled for deterministic evidence; expiry covered by integration suite',
      },
      limitations: [
        'No real AUTH users or roles were created.',
        'Role changes and ADMIN scope were simulated by the AUTH fixture.',
        'These artifacts are not Postman captures or final team integration evidence.',
        'Synthetic controls do not establish real-world detector accuracy; noise-control.png is a known false positive.',
      ],
      source: await sourceFingerprint(),
      cases,
      assertions: {
        cases_passed: cases.length,
        audit_events: audit.length,
        correlated_http_events: cases.length,
        original_bytes_verified: retained.length,
        secrets_absent_from_audit: true,
      },
    };
    const reportJson = JSON.stringify(report);
    for (const forbidden of [
      token,
      altered,
      expired,
      fixture.auth.config.AUTH_SERVICE_SECRET,
      queryProbe,
      headerProbe,
    ])
      expect(reportJson).not.toContain(forbidden);
    await writeDeliveryArtifact('report.json', report);
    await writeDeliveryArtifact('audit.json', {
      evidence_kind: 'local_fixture',
      generated_at: report.completed_at,
      events: audit,
    });
  });
});
