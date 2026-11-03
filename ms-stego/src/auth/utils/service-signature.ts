import { createHash, createHmac, randomBytes } from 'node:crypto';

export const AUTHORIZATION_PATH = '/internal/authorization/check';

export function createServiceHeaders(
  body: string,
  serviceId: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
  nonce = randomBytes(32).toString('hex'),
): Record<string, string> {
  const digest = createHash('sha256').update(body, 'utf8').digest('hex');
  const message = [
    serviceId,
    'POST',
    AUTHORIZATION_PATH,
    timestamp,
    nonce,
    digest,
  ].join('\n');
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(message, 'utf8')
    .digest('hex');
  return {
    'X-Service-Id': serviceId,
    'X-Service-Timestamp': timestamp,
    'X-Service-Nonce': nonce,
    'X-Service-Signature': signature,
  };
}
