#!/usr/bin/env node

import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }

  return value;
}

const force = process.argv.includes('--force');
const outputDirectory = resolve(readOption('--out', 'keys'));
const privateKeyPath = resolve(outputDirectory, 'jwt-private.pem');
const publicKeyPath = resolve(outputDirectory, 'jwt-public.pem');

if (!force && (existsSync(privateKeyPath) || existsSync(publicKeyPath))) {
  console.error('JWT key files already exist. Use --force to overwrite them.');
  process.exit(1);
}

mkdirSync(outputDirectory, {
  recursive: true,
  mode: 0o700,
});

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

writeFileSync(privateKeyPath, privateKey, {
  mode: 0o600,
});
chmodSync(privateKeyPath, 0o600);
writeFileSync(publicKeyPath, publicKey, {
  mode: 0o644,
});

const jwk = createPublicKey(publicKey).export({
  format: 'jwk',
});
const keyId = createHash('sha256')
  .update(
    JSON.stringify({
      e: jwk.e,
      kty: 'RSA',
      n: jwk.n,
    }),
    'utf8',
  )
  .digest('base64url');

console.log('Generated JWT RSA keys:');
console.log(`  Private key: ${privateKeyPath} (mode 0600)`);
console.log(`  Public key:  ${publicKeyPath}`);
console.log(`  Key ID:      ${keyId}`);
console.log('');
console.log('Add these values to your .env file:');
console.log(`JWT_PRIVATE_KEY_PATH=${privateKeyPath}`);
console.log(`JWT_PUBLIC_KEY_PATH=${publicKeyPath}`);
console.log(`JWT_KEY_ID=${keyId}`);
