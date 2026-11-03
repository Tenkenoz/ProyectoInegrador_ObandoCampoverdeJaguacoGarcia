import { createServer, Agent, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { requestHttpsJson } from './https-json.js';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import { createTlsFixture } from '../../../test/helpers/tls-fixture.js';

describe('HTTPS JSON transport', () => {
  let tls: ReturnType<typeof createTlsFixture>;
  let server: Server;
  let agent: Agent;
  let origin: string;
  let redirectedRequests = 0;

  beforeAll(async () => {
    tls = createTlsFixture();
    agent = new Agent({ ca: tls.cert, rejectUnauthorized: true });
    server = createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      switch (req.url) {
        case '/redirect':
          res.writeHead(302, { Location: '/target' });
          res.end('{}');
          break;
        case '/target':
          redirectedRequests++;
          res.end('{}');
          break;
        case '/large':
          res.end(JSON.stringify({ value: 'x'.repeat(65536) }));
          break;
        case '/invalid':
          res.end('{');
          break;
        case '/slow':
          break;
        case '/wrong-type':
          res.setHeader('Content-Type', 'text/html');
          res.end('{}');
          break;
        case '/unauthorized':
          res.writeHead(401);
          res.end('{"code":"session_revoked"}');
          break;
        default:
          res.end('{"keys":[]}');
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    agent.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    tls.dispose();
  });

  it('accepts a trusted certificate and parses JSON', async () => {
    await expect(
      requestHttpsJson(new URL(origin), agent, 1000),
    ).resolves.toEqual({ status: 200, body: { keys: [] } });
  });

  it('rejects an untrusted certificate', async () => {
    const untrusted = new Agent();
    try {
      await expect(
        requestHttpsJson(new URL(origin), untrusted, 1000),
      ).rejects.toBeInstanceOf(AuthDependencyError);
    } finally {
      untrusted.destroy();
    }
  });

  it.each(['/redirect', '/large', '/invalid', '/wrong-type'])(
    'rejects unsafe response %s',
    async (path) => {
      await expect(
        requestHttpsJson(new URL(origin + path), agent, 1000),
      ).rejects.toBeInstanceOf(AuthDependencyError);
      expect(redirectedRequests).toBe(0);
    },
  );

  it('limits the complete request time', async () => {
    await expect(
      requestHttpsJson(new URL(origin + '/slow'), agent, 50),
    ).rejects.toBeInstanceOf(AuthDependencyError);
  });

  it('preserves structured authentication errors', async () => {
    await expect(
      requestHttpsJson(new URL(origin + '/unauthorized'), agent, 1000),
    ).resolves.toEqual({ status: 401, body: { code: 'session_revoked' } });
  });

  it('rejects plaintext endpoints', async () => {
    await expect(
      requestHttpsJson(new URL('http://127.0.0.1'), agent, 1000),
    ).rejects.toBeInstanceOf(AuthDependencyError);
  });
});
