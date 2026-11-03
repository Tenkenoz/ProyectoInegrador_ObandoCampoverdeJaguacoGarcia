import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthHttpClient } from '../clients/auth-http.client.js';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import { JwksService } from './jwks.service.js';
import { JwtVerifierService } from './jwt-verifier.service.js';
import { createSigningFixture } from '../../../test/helpers/jwt-fixture.js';

describe('JWT verification', () => {
  let signing: Awaited<ReturnType<typeof createSigningFixture>>;
  let other: Awaited<ReturnType<typeof createSigningFixture>>;
  let getJwks: ReturnType<typeof vi.fn>;
  let verifier: JwtVerifierService;

  beforeAll(async () => {
    [signing, other] = await Promise.all([
      createSigningFixture(),
      createSigningFixture(),
    ]);
  });
  beforeEach(() => {
    getJwks = vi
      .fn()
      .mockResolvedValue({ status: 200, body: { keys: [signing.jwk] } });
    verifier = new JwtVerifierService(
      new JwksService({ getJwks } as unknown as AuthHttpClient),
    );
  });

  it('returns only the verified subject and session version', async () => {
    const token = await signing.issue({ roles: ['ADMIN'] });
    await expect(verifier.verify(token)).resolves.toEqual({
      userId: signing.userId,
      tokenVersion: 0,
    });
  });

  it.each([
    { iss: 'other-issuer' },
    { aud: 'other-audience' },
    { typ: 'refresh' },
    { sub: 'invalid' },
    { tokenVersion: -1 },
    { tokenVersion: '0' },
    { typ: undefined },
    { tokenVersion: undefined },
    { iat: undefined },
    { exp: undefined },
    {
      iat: Math.floor(Date.now() / 1000) - 1500,
      exp: Math.floor(Date.now() / 1000) - 600,
    },
    { iat: Math.floor(Date.now() / 1000) + 60 },
    { exp: Math.floor(Date.now() / 1000) + 1800 },
    { nbf: Math.floor(Date.now() / 1000) + 60 },
  ])('rejects invalid claims %j', async (claims) => {
    await expect(
      verifier.verify(await signing.issue(claims)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a signature made by another key', async () => {
    await expect(verifier.verify(await other.issue())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing key identifier', async () => {
    await expect(
      verifier.verify(await signing.issue({}, { kid: undefined })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(getJwks).not.toHaveBeenCalled();
  });

  it('rejects an unexpected algorithm before retrieving keys', async () => {
    const token = await signing.issue();
    const [, payload, signature] = token.split('.');
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', kid: 'auth-key' }),
    ).toString('base64url');
    await expect(
      verifier.verify(`${header}.${payload}.${signature}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(getJwks).not.toHaveBeenCalled();
  });

  it.each(['malformed', 'x'.repeat(8193)])(
    'rejects a malformed or oversized token',
    async (token) => {
      await expect(verifier.verify(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(getJwks).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown key confirmed by AUTH', async () => {
    await expect(
      verifier.verify(await signing.issue({}, { kid: 'missing' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns 503 when a required signing key cannot be retrieved', async () => {
    getJwks.mockRejectedValue(new AuthDependencyError());
    await expect(verifier.verify(await signing.issue())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
