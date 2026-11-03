import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface Jwk {
  kty: 'RSA';
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
}

export interface Jwks {
  keys: Jwk[];
}

@Injectable()
export class JwtKeyService {
  private readonly privateKeyPem: string;
  private readonly publicKeyPem: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly jwk: Jwk;
  private readonly keyId: string;

  constructor(private readonly configService: ConfigService) {
    this.privateKeyPem = this.readKey('JWT_PRIVATE_KEY_PATH');
    this.publicKeyPem = this.readKey('JWT_PUBLIC_KEY_PATH');
    this.privateKey = this.parsePrivateKey(this.privateKeyPem);
    this.publicKey = this.parsePublicKey(this.publicKeyPem);

    this.assertRsaKey(this.privateKey, 'private');
    this.assertRsaKey(this.publicKey, 'public');
    this.assertMatchingKeys();

    const publicJwk = this.exportPublicJwk();
    this.keyId =
      this.configService.get<string>('JWT_KEY_ID')?.trim() ||
      this.calculateThumbprint(publicJwk);

    this.jwk = {
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid: this.keyId,
      n: publicJwk.n,
      e: publicJwk.e,
    };
  }

  getPrivateKeyPem(): string {
    return this.privateKeyPem;
  }

  getPublicKeyPem(): string {
    return this.publicKeyPem;
  }

  getKeyId(): string {
    return this.keyId;
  }

  getJwks(): Jwks {
    return {
      keys: [{ ...this.jwk }],
    };
  }

  private readKey(environmentVariable: string): string {
    const configuredPath =
      this.configService.getOrThrow<string>(environmentVariable);
    const absolutePath = isAbsolute(configuredPath)
      ? configuredPath
      : resolve(process.cwd(), configuredPath);

    try {
      return readFileSync(absolutePath, 'utf8');
    } catch {
      throw new Error(
        `Unable to read ${environmentVariable} from ${absolutePath}`,
      );
    }
  }

  private parsePrivateKey(pem: string): KeyObject {
    try {
      return createPrivateKey(pem);
    } catch {
      throw new Error('Invalid JWT private key');
    }
  }

  private parsePublicKey(pem: string): KeyObject {
    try {
      return createPublicKey(pem);
    } catch {
      throw new Error('Invalid JWT public key');
    }
  }

  private assertRsaKey(key: KeyObject, label: string): void {
    if (key.asymmetricKeyType !== 'rsa') {
      throw new Error(`The JWT ${label} key must be an RSA key`);
    }

    const modulusLength = key.asymmetricKeyDetails?.modulusLength;

    if (!modulusLength || modulusLength < 2048) {
      throw new Error(`The JWT ${label} key must use at least 2048 bits`);
    }
  }

  private assertMatchingKeys(): void {
    const derivedPublicKey = createPublicKey(this.privateKey).export({
      type: 'spki',
      format: 'der',
    });

    const configuredPublicKey = this.publicKey.export({
      type: 'spki',
      format: 'der',
    });

    if (!derivedPublicKey.equals(configuredPublicKey)) {
      throw new Error('The JWT public key does not match the private key');
    }
  }

  private exportPublicJwk(): { n: string; e: string } {
    const jwk = this.publicKey.export({
      format: 'jwk',
    }) as JsonWebKey;

    if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
      throw new Error(
        'The JWT public key must expose an RSA modulus and exponent',
      );
    }

    return {
      n: jwk.n,
      e: jwk.e,
    };
  }

  private calculateThumbprint(publicJwk: { n: string; e: string }): string {
    const canonicalJwk = JSON.stringify({
      e: publicJwk.e,
      kty: 'RSA',
      n: publicJwk.n,
    });

    return createHash('sha256')
      .update(canonicalJwk, 'utf8')
      .digest('base64url');
  }
}
