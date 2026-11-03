import { createHash, createHmac } from 'node:crypto';
import { createServiceHeaders } from './service-signature.js';

describe('Service signatures', () => {
  const secret = 'ab'.repeat(32);

  it('signs the agreed LF-delimited message and exact body bytes', () => {
    const body =
      '{"subject_token":"token","action":"steganography.analyze","resource_id":null}';
    const nonce = 'cd'.repeat(32);
    const headers = createServiceHeaders(
      body,
      'stego',
      secret,
      '1700000000',
      nonce,
    );
    const digest = createHash('sha256').update(body).digest('hex');
    const expected = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(
        `stego\nPOST\n/internal/authorization/check\n1700000000\n${nonce}\n${digest}`,
      )
      .digest('hex');
    expect(headers['X-Service-Signature']).toBe(expected);
    expect(headers['X-Service-Timestamp']).toBe('1700000000');
    expect(headers['X-Service-Nonce']).toBe(nonce);
    expect(
      createServiceHeaders(body + ' ', 'stego', secret, '1700000000', nonce)[
        'X-Service-Signature'
      ],
    ).not.toBe(expected);
  });

  it('generates a fresh nonce for every request', () => {
    const first = createServiceHeaders('{}', 'stego', secret);
    const second = createServiceHeaders('{}', 'stego', secret);
    expect(first['X-Service-Nonce']).toMatch(/^[a-f0-9]{64}$/);
    expect(first['X-Service-Nonce']).not.toBe(second['X-Service-Nonce']);
  });
});
