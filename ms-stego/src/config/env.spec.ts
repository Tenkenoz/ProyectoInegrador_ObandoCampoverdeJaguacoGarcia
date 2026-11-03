import { validateEnvironment } from './env.js';

const valid = {
  DB_USERNAME: 'stego',
  DB_PASSWORD: 'test-secret',
  DB_DATABASE: 'stego',
};

describe('Environment validation', () => {
  it('converts ports and supplies defaults', () => {
    expect(validateEnvironment({ ...valid, PORT: '3004' })).toMatchObject({
      PORT: 3004,
      DB_PORT: 5433,
    });
  });

  it.each(['0', '65536', 'abc', '3.5'])('rejects invalid port %s', (PORT) => {
    expect(() => validateEnvironment({ ...valid, PORT })).toThrow('PORT');
  });

  it('rejects missing database credentials', () => {
    expect(() => validateEnvironment({})).toThrow('DB_PASSWORD');
  });

  it('does not include provided secrets in validation errors', () => {
    expect(() =>
      validateEnvironment({ ...valid, NODE_ENV: 'secret-value' }),
    ).toThrow('Invalid environment variables: NODE_ENV');
  });
});
