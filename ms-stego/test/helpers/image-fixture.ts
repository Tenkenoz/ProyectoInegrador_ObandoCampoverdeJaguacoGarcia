import { PNG } from 'pngjs';
import { crc32 } from '../../src/steganography/utils/crc32.js';

export function createPixels(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    pixels[index * 4] = (index * 17 + 1) & 255;
    pixels[index * 4 + 1] = (index * 23 + 2) & 255;
    pixels[index * 4 + 2] = (index * 31 + 3) & 255;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

export function createPngFixture(width = 3, height = 2, alpha = true) {
  const pixels = createPixels(width, height);
  const image = new PNG({ width, height });
  image.data = pixels;
  return {
    buffer: PNG.sync.write(image, { colorType: alpha ? 6 : 2 }),
    pixels,
    width,
    height,
  };
}

export function createBmpFixture(
  width = 3,
  height = 2,
  bits: 24 | 32 = 24,
  topDown = false,
) {
  const pixels = createPixels(width, height);
  const stride = Math.ceil((width * bits) / 32) * 4;
  const buffer = Buffer.alloc(54 + stride * height);
  buffer.write('BM');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(topDown ? -height : height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bits, 28);
  buffer.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    const row = topDown ? y : height - y - 1;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = 54 + row * stride + x * (bits / 8);
      buffer[target] = pixels[source + 2]!;
      buffer[target + 1] = pixels[source + 1]!;
      buffer[target + 2] = pixels[source]!;
      if (bits === 32) buffer[target + 3] = 77;
    }
  }
  return { buffer, pixels, width, height };
}

export function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 4, 'latin1');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(chunk.subarray(4, chunk.length - 4)),
    chunk.length - 4,
  );
  return chunk;
}

export function replacePngHeader(
  buffer: Buffer,
  change: (header: Buffer) => void,
) {
  const header = Buffer.from(buffer.subarray(16, 29));
  change(header);
  return Buffer.concat([
    buffer.subarray(0, 8),
    pngChunk('IHDR', header),
    buffer.subarray(33),
  ]);
}
