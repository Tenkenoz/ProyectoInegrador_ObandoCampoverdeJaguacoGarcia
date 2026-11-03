import { randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

export async function createSigningFixture(kid = 'auth-key') {
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: 'RS256',
    use: 'sig',
  };
  const userId = randomUUID();
  return {
    jwk,
    userId,
    issue: (
      claims: Record<string, unknown> = {},
      headers: Record<string, unknown> = {},
    ) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        sub: userId,
        iss: 'secure-chat-auth',
        aud: 'secure-chat-api',
        iat: now,
        exp: now + 900,
        typ: 'access',
        tokenVersion: 0,
        ...claims,
      })
        .setProtectedHeader({ alg: 'RS256', kid, ...headers })
        .sign(privateKey);
    },
  };
}
