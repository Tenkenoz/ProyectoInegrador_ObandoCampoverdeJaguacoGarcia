import { PNG } from 'pngjs';

export function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
): Buffer {
  if (pixels.length !== width * height * 4)
    throw new RangeError('Inconsistent sample dimensions');
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixels);
  return PNG.sync.write(png, { bitDepth: 8, colorType: 6 });
}

export function encodeBmp(
  pixels: Uint8Array,
  width: number,
  height: number,
): Buffer {
  if (pixels.length !== width * height * 4)
    throw new RangeError('Inconsistent sample dimensions');
  const stride = Math.ceil((width * 3) / 4) * 4;
  const result = Buffer.alloc(54 + stride * height);
  result.write('BM');
  result.writeUInt32LE(result.length, 2);
  result.writeUInt32LE(54, 10);
  result.writeUInt32LE(40, 14);
  result.writeInt32LE(width, 18);
  result.writeInt32LE(height, 22);
  result.writeUInt16LE(1, 26);
  result.writeUInt16LE(24, 28);
  result.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = 54 + (height - y - 1) * stride + x * 3;
      result[target] = pixels[source + 2]!;
      result[target + 1] = pixels[source + 1]!;
      result[target + 2] = pixels[source]!;
    }
  }
  return result;
}
