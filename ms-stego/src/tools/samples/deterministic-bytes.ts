import { createHash } from 'node:crypto';

export function deterministicBytes(label: string, length: number): Buffer {
  const output = Buffer.alloc(length);
  for (let offset = 0, counter = 0; offset < length; offset += 32, counter++) {
    const index = Buffer.alloc(4);
    index.writeUInt32BE(counter);
    createHash('sha256')
      .update(label, 'utf8')
      .update(index)
      .digest()
      .copy(output, offset, 0, Math.min(32, length - offset));
  }
  return output;
}
