#!/usr/bin/env node
/*
 * Forges a JWT signed with the AUTH development key.
 *
 * It exists to exercise rejection paths that a normal client cannot produce:
 * expired tokens, wrong issuer/audience/type, missing claims, unknown kid and
 * algorithm confusion. The signing key never leaves the machine and the
 * resulting token is printed to stdout only.
 *
 * Examples:
 *   node scripts/forge-token.mjs --sub <uuid> --expired
 *   node scripts/forge-token.mjs --issuer attacker --expires-in 900
 *   node scripts/forge-token.mjs --kid unknown-key --expires-in 900
 */

import { createHash, createHmac, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function flag(name) {
  return process.argv.includes(name);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

const privateKeyPath = resolve(
  root,
  option('--private-key', 'ms-users-nestjs/keys/jwt-private.pem'),
);
const publicKeyPath = resolve(
  root,
  option('--public-key', 'ms-users-nestjs/keys/jwt-public.pem'),
);

const privateKeyPem = readFileSync(privateKeyPath, 'utf8');
const publicKeyPem = readFileSync(publicKeyPath, 'utf8');
const privateKey = createPrivateKey(privateKeyPem);
const publicKey = createPublicKey(publicKeyPem);

const derivedPublicPem = createPublicKey(privateKey).export({
  type: 'spki',
  format: 'pem',
});
const configuredPublicPem = publicKey.export({
  type: 'spki',
  format: 'pem',
});

if (derivedPublicPem !== configuredPublicPem) {
  throw new Error('The private key does not match the public key');
}

const jwk = publicKey.export({ format: 'jwk' });
const derivedKid = createHash('sha256')
  .update(JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n }), 'utf8')
  .digest('base64url');

const algorithm = option('--algorithm', 'RS256');
const kid = option('--kid', derivedKid);
const subject = option('--sub', '00000000-0000-4000-8000-000000000000');
const issuer = option('--issuer', 'secure-chat-auth');
const audience = option('--audience', 'secure-chat-api');
const type = option('--typ', 'access');
const tokenVersion = Number(option('--token-version', '0'));
const expiresIn = Number(option('--expires-in', '900'));
const issuedAtOffset = Number(option('--issued-at-offset', '0'));
const now = Math.floor(Date.now() / 1000);
const issuedAt = now + issuedAtOffset;
const expiresAt = flag('--expired')
  ? now - 120
  : now + expiresIn;

const header = {
  alg: algorithm,
  typ: 'JWT',
  kid,
};

const payload = {
  sub: subject,
  username: option('--username', 'forged'),
  tokenVersion,
  typ: type,
  iat: issuedAt,
  exp: expiresAt,
  aud: audience,
  iss: issuer,
};

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

let signature;

if (algorithm === 'HS256') {
  const secret = option('--hmac-secret', 'development-only-secret');
  signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
} else if (algorithm === 'RS256') {
  signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString(
    'base64url',
  );
} else if (algorithm === 'none') {
  signature = '';
} else {
  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

process.stdout.write(`${signingInput}.${signature}\n`);
