import type { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JwtKeyService } from './jwt-key.service.js';

describe('JwtKeyService', () => {
  let directory: string;
  let privateKeyPath: string;
  let publicKeyPath: string;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'auth-jwt-keys-'));
    privateKeyPath = join(directory, 'jwt-private.pem');
    publicKeyPath = join(directory, 'jwt-public.pem');

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
    writeFileSync(publicKeyPath, publicKey);
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function createService(
    overrides: Record<string, string> = {},
  ): JwtKeyService {
    const values: Record<string, string> = {
      JWT_PRIVATE_KEY_PATH: privateKeyPath,
      JWT_PUBLIC_KEY_PATH: publicKeyPath,
      JWT_KEY_ID: 'test-key-1',
      ...overrides,
    };

    const configService = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => {
        const value = values[key];

        if (!value) {
          throw new Error(`Missing ${key}`);
        }

        return value;
      },
    } as unknown as ConfigService;

    return new JwtKeyService(configService);
  }

  it('loads an RSA key pair and exposes only public JWKS material', () => {
    const service = createService();
    const jwks = service.getJwks();

    expect(service.getKeyId()).toBe('test-key-1');
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid: 'test-key-1',
    });
    expect(jwks.keys[0].n).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(jwks.keys[0].e).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.stringify(jwks)).not.toContain('PRIVATE KEY');
    expect(service.getPrivateKeyPem()).toContain('BEGIN PRIVATE KEY');
    expect(service.getPublicKeyPem()).toContain('BEGIN PUBLIC KEY');
  });

  it('derives a stable key id when JWT_KEY_ID is empty', () => {
    const firstService = createService({ JWT_KEY_ID: '' });
    const secondService = createService({ JWT_KEY_ID: '' });

    expect(firstService.getKeyId()).toBe(secondService.getKeyId());
    expect(firstService.getKeyId()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects a public key that does not match the private key', () => {
    const otherPublicKeyPath = join(directory, 'other-public.pem');
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    writeFileSync(otherPublicKeyPath, publicKey);

    expect(() =>
      createService({ JWT_PUBLIC_KEY_PATH: otherPublicKeyPath }),
    ).toThrow('does not match');
  });
});
