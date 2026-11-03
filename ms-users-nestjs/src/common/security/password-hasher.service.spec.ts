import { PasswordHasher } from './password-hasher.service.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();
  const password = 'ValidPassword123!';

  it('hashes passwords with Argon2id', async () => {
    const hash = await hasher.hash(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, password)).resolves.toBe(true);
    await expect(hasher.verify(hash, 'WrongPassword123!')).resolves.toBe(false);
  });

  it('produces a different hash for the same password', async () => {
    const firstHash = await hasher.hash(password);
    const secondHash = await hasher.hash(password);

    expect(firstHash).not.toBe(secondHash);
  });
});
