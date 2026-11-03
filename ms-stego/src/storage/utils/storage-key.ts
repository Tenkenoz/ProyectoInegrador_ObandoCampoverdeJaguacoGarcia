import { z } from 'zod';

export function storageFilename(key: string): string {
  return `${z.uuid().parse(key)}.bin`;
}

export function parseStorageFilename(filename: string): string | null {
  if (!filename.endsWith('.bin')) return null;
  return z.uuid().safeParse(filename.slice(0, -4)).data ?? null;
}
