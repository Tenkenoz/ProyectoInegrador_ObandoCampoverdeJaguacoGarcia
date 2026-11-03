import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function createTlsFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'stego-auth-test-'));
  const configPath = join(directory, 'openssl.cnf');
  const certPath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  writeFileSync(
    configPath,
    `[req]
distinguished_name=dn
x509_extensions=v3
prompt=no
[dn]
CN=localhost
[v3]
basicConstraints=critical,CA:TRUE
keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
`,
  );
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-config',
        configPath,
      ],
      { stdio: 'ignore' },
    );
    return {
      certPath,
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
      dispose: () => rmSync(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
