import { request, type Agent } from 'node:https';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import type { AuthHttpResponse } from '../interfaces/auth-http-response.js';

const MAX_RESPONSE_BYTES = 65536;

export function requestHttpsJson(
  url: URL,
  agent: Agent,
  timeout: number,
  body?: string,
  headers: Record<string, string> = {},
): Promise<AuthHttpResponse> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'https:' || url.username || url.password) {
      reject(new AuthDependencyError());
      return;
    }
    const req = request(url, {
      method: body === undefined ? 'GET' : 'POST',
      agent,
      headers: {
        Accept: 'application/json, application/jwk-set+json',
        ...(body === undefined
          ? {}
          : {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body).toString(),
            }),
        ...headers,
      },
    });
    const timer = setTimeout(
      () => req.destroy(new AuthDependencyError()),
      timeout,
    );
    const fail = () => {
      clearTimeout(timer);
      reject(new AuthDependencyError());
    };
    req.once('error', fail);
    req.once('response', (response) => {
      const type = response.headers['content-type']
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      if (
        (response.statusCode !== 200 && response.statusCode !== 401) ||
        (type !== 'application/json' && type !== 'application/jwk-set+json') ||
        (response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity')
      ) {
        fail();
        response.destroy();
        req.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          fail();
          response.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', fail);
      response.once('aborted', fail);
      response.once('end', () => {
        clearTimeout(timer);
        try {
          const parsed: unknown = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
          );
          resolve({ status: response.statusCode!, body: parsed });
        } catch {
          fail();
        }
      });
    });
    req.end(body);
  });
}
