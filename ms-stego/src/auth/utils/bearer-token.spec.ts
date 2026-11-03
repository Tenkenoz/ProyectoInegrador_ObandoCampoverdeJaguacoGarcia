import { UnauthorizedException } from '@nestjs/common';
import { extractBearerToken } from './bearer-token.js';

describe('Bearer tokens', () => {
  it('accepts the bearer scheme case-insensitively', () => {
    expect(extractBearerToken('bearer token')).toBe('token');
  });

  it.each([
    undefined,
    '',
    'Basic token',
    'Bearer',
    'Bearer token another',
    'Bearer one,two',
    ['Bearer token'],
    'Bearer ' + 'x'.repeat(8194),
  ])('rejects malformed authorization', (header) => {
    expect(() => extractBearerToken(header)).toThrow(UnauthorizedException);
  });

  it('rejects duplicate authorization headers', () => {
    expect(() =>
      extractBearerToken('Bearer one', [
        'Authorization',
        'Bearer one',
        'authorization',
        'Bearer two',
      ]),
    ).toThrow(UnauthorizedException);
  });
});
