import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthHttpClient } from './auth-http.client.js';
import { validateAuthConfiguration } from '../config/auth.config.js';

describe('AUTH trust configuration', () => {
  it('refuses to start without a readable CA certificate', () => {
    const config = validateAuthConfiguration({
      AUTH_CA_CERT_PATH: '/missing/stego-ca.pem',
      AUTH_SERVICE_SECRET: 'ab'.repeat(32),
    });
    expect(() => new AuthHttpClient(config)).toThrow(
      'Unable to load the AUTH CA certificate',
    );
  });

  it('refuses malformed certificates without exposing file contents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'stego-invalid-ca-'));
    const path = join(directory, 'invalid.pem');
    writeFileSync(path, 'private-certificate-content');
    try {
      const config = validateAuthConfiguration({
        AUTH_CA_CERT_PATH: path,
        AUTH_SERVICE_SECRET: 'ab'.repeat(32),
      });
      expect(() => new AuthHttpClient(config)).toThrow(
        'Unable to load the AUTH CA certificate',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
