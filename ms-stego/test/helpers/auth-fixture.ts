import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { createSigningFixture } from './jwt-fixture.js';
import { createTlsFixture } from './tls-fixture.js';

export async function createAuthFixture() {
  const tls = createTlsFixture();
  const signing = await createSigningFixture();
  const secret = 'ab'.repeat(32);
  const state = {
    mode: 'allow' as
      | 'allow'
      | 'deny'
      | 'session_revoked'
      | 'unavailable'
      | 'invalid_service'
      | 'mismatch'
      | 'timeout',
    scope: 'own' as 'own' | 'any',
    jwksUnavailable: false,
    jwksRequests: 0,
    authorizationRequests: 0,
    validSignatures: 0,
  };
  const nonces = new Set<string>();
  const server = createServer({ cert: tls.cert, key: tls.key }, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/.well-known/jwks.json' && req.method === 'GET') {
      state.jwksRequests++;
      res.statusCode = state.jwksUnavailable ? 503 : 200;
      res.end(
        JSON.stringify(state.jwksUnavailable ? {} : { keys: [signing.jwk] }),
      );
      return;
    }
    if (req.url !== '/internal/authorization/check' || req.method !== 'POST') {
      res.writeHead(404);
      res.end('{}');
      return;
    }
    state.authorizationRequests++;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const timestamp = req.headers['x-service-timestamp'];
      const nonce = req.headers['x-service-nonce'];
      const signature = req.headers['x-service-signature'];
      const digest = createHash('sha256').update(body).digest('hex');
      const canonical = [
        'stego',
        'POST',
        '/internal/authorization/check',
        timestamp,
        nonce,
        digest,
      ].join('\n');
      const expected = createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(canonical)
        .digest();
      const provided =
        typeof signature === 'string' && /^[a-f0-9]{64}$/.test(signature)
          ? Buffer.from(signature, 'hex')
          : Buffer.alloc(0);
      if (
        req.headers['x-service-id'] !== 'stego' ||
        typeof timestamp !== 'string' ||
        !/^\d+$/.test(timestamp) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 30 ||
        typeof nonce !== 'string' ||
        !/^[a-f0-9]{64}$/.test(nonce) ||
        nonces.has(nonce) ||
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      ) {
        res.writeHead(401);
        res.end('{"code":"invalid_service_credentials"}');
        return;
      }
      nonces.add(nonce);
      state.validSignatures++;
      if (state.mode === 'timeout') return;
      if (state.mode === 'unavailable') {
        res.writeHead(503);
        res.end('{}');
        return;
      }
      if (state.mode === 'invalid_service') {
        res.writeHead(401);
        res.end('{"code":"invalid_service_credentials"}');
        return;
      }
      if (state.mode === 'session_revoked') {
        res.writeHead(401);
        res.end('{"code":"session_revoked"}');
        return;
      }
      const input = JSON.parse(body) as {
        action: string;
        resource_id: string | null;
      };
      const allowed = state.mode !== 'deny';
      res.end(
        JSON.stringify({
          subject_id: signing.userId,
          action: state.mode === 'mismatch' ? 'unknown.action' : input.action,
          resource_id: input.resource_id,
          allowed,
          scope: allowed ? state.scope : null,
          reason: allowed
            ? 'active_role_grants_permission'
            : 'insufficient_permissions',
        }),
      );
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    state,
    signing,
    config: {
      AUTH_BASE_URL: origin,
      AUTH_JWKS_URL: origin + '/.well-known/jwks.json',
      AUTH_CA_CERT_PATH: tls.certPath,
      AUTH_SERVICE_ID: 'stego',
      AUTH_SERVICE_SECRET: secret,
      AUTH_TIMEOUT_MS: 300,
    },
    dispose: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      tls.dispose();
    },
  };
}
