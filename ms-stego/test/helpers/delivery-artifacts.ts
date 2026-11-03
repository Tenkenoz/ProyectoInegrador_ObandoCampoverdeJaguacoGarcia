import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : Promise.resolve([path]);
    }),
  );
  return groups.flat();
}

export async function sourceFingerprint() {
  const paths = [
    ...(await sourceFiles('src')),
    'package.json',
    'pnpm-lock.yaml',
    'samples/manifest.json',
  ].sort();
  const files = await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    })),
  );
  return {
    algorithm: 'sha256',
    digest: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
    files,
  };
}

export async function writeDeliveryArtifact(filename: string, value: unknown) {
  await mkdir('docs/evidence/local', { recursive: true });
  await writeFile(
    `docs/evidence/local/${filename}`,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
