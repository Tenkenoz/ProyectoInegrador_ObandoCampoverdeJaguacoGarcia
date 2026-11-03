import { AuthHttpClient } from '../clients/auth-http.client.js';
import { AuthDependencyError } from '../errors/auth-dependency.error.js';
import { UnknownSigningKeyError } from '../errors/unknown-signing-key.error.js';
import { JwksService } from './jwks.service.js';
import { createSigningFixture } from '../../../test/helpers/jwt-fixture.js';

describe('JWKS cache', () => {
  let first: Awaited<ReturnType<typeof createSigningFixture>>;
  let second: Awaited<ReturnType<typeof createSigningFixture>>;
  let getJwks: ReturnType<typeof vi.fn>;
  let service: JwksService;
  let now: number;

  beforeAll(async () => {
    [first, second] = await Promise.all([
      createSigningFixture('first'),
      createSigningFixture('second'),
    ]);
  });
  beforeEach(() => {
    now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    getJwks = vi
      .fn()
      .mockResolvedValue({ status: 200, body: { keys: [first.jwk] } });
    service = new JwksService({ getJwks } as unknown as AuthHttpClient);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses keys for five minutes and refreshes after expiry', async () => {
    await service.getKey('first');
    now += 299999;
    await service.getKey('first');
    expect(getJwks).toHaveBeenCalledTimes(1);
    now += 1;
    await service.getKey('first');
    expect(getJwks).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refreshes', async () => {
    await Promise.all([
      service.getKey('first'),
      service.getKey('first'),
      service.getKey('first'),
    ]);
    expect(getJwks).toHaveBeenCalledTimes(1);
  });

  it('limits refreshes caused by unknown identifiers and accepts rotation', async () => {
    await service.getKey('first');
    await expect(service.getKey('missing')).rejects.toBeInstanceOf(
      UnknownSigningKeyError,
    );
    expect(getJwks).toHaveBeenCalledTimes(1);
    now += 30000;
    getJwks.mockResolvedValue({
      status: 200,
      body: { keys: [first.jwk, second.jwk] },
    });
    await service.getKey('second');
    expect(getJwks).toHaveBeenCalledTimes(2);
    await service.getKey('first');
    expect(getJwks).toHaveBeenCalledTimes(2);
  });

  it('does not use expired keys when refresh fails', async () => {
    await service.getKey('first');
    now += 300000;
    getJwks.mockRejectedValue(new Error('network failure'));
    await expect(service.getKey('first')).rejects.toBeInstanceOf(
      AuthDependencyError,
    );
    await expect(service.getKey('first')).rejects.toBeInstanceOf(
      AuthDependencyError,
    );
    expect(getJwks).toHaveBeenCalledTimes(2);
  });

  it.each([
    { keys: [] },
    { keys: [{ kty: 'oct', kid: 'first', k: 'secret' }] },
  ])('rejects an unusable key set', async (body) => {
    getJwks.mockResolvedValue({ status: 200, body });
    await expect(service.getKey('first')).rejects.toBeInstanceOf(
      AuthDependencyError,
    );
  });

  it('rejects duplicate identifiers and private key fields', async () => {
    getJwks.mockResolvedValueOnce({
      status: 200,
      body: { keys: [first.jwk, first.jwk] },
    });
    await expect(service.getKey('first')).rejects.toBeInstanceOf(
      AuthDependencyError,
    );
    now += 30000;
    getJwks.mockResolvedValueOnce({
      status: 200,
      body: { keys: [{ ...first.jwk, d: 'private' }] },
    });
    await expect(service.getKey('first')).rejects.toBeInstanceOf(
      AuthDependencyError,
    );
  });
});
