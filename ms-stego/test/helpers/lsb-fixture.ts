import { PNG } from 'pngjs';

export function createLsbFixture(balanced: boolean, width = 64, height = 64) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const value =
      2 * (index % 128) + (balanced ? Math.floor(index / 128) % 2 : 0);
    pixels.set([value, value, value, 255], index * 4);
  }
  const image = new PNG({ width, height });
  image.data = pixels;
  return { pixels, buffer: PNG.sync.write(image), width, height };
}
