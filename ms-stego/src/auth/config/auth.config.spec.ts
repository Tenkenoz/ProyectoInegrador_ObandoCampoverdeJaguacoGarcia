import { validateAuthConfiguration } from './auth.config.js';

const valid = {
  AUTH_CA_CERT_PATH: '/run/certs/ca.pem',
  AUTH_SERVICE_SECRET: 'ab'.repeat(32),
};

describe('Authentication configuration', () => {
  it('provides the agreed endpoints and timeout', () => {
    expect(validateAuthConfiguration(valid)).toMatchObject({
      AUTH_BASE_URL: 'https://auth:3001',
      AUTH_TIMEOUT_MS: 3000,
    });
  });

  it.each([
    'http://auth:3001',
    'https://user:password@auth:3001',
    'https://auth:3001?redirect=other',
    'https://auth:3001/api',
  ])('rejects an unsafe base URL %s', (AUTH_BASE_URL) => {
    expect(() =>
      validateAuthConfiguration({ ...valid, AUTH_BASE_URL }),
    ).toThrow('AUTH_BASE_URL');
  });

  it.each(['', 'ab', 'x'.repeat(64)])(
    'rejects an invalid service secret',
    (AUTH_SERVICE_SECRET) => {
      expect(() =>
        validateAuthConfiguration({ ...valid, AUTH_SERVICE_SECRET }),
      ).toThrow('AUTH_SERVICE_SECRET');
    },
  );

  it('does not disclose invalid secret values', () => {
    expect(() =>
      validateAuthConfiguration({
        ...valid,
        AUTH_SERVICE_SECRET: 'private-value',
      }),
    ).toThrow('Invalid authentication configuration: AUTH_SERVICE_SECRET');
  });
});
