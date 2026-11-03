import { deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import {
  createBmpFixture,
  createPngFixture,
  pngChunk,
  replacePngHeader,
} from '../../../test/helpers/image-fixture.js';
import { validateUploadConfiguration } from '../config/upload.config.js';
import { crc32 } from './crc32.js';
import { decodeImage } from './decode-image.js';

const limits = validateUploadConfiguration({});

function expectStatus(callback: () => unknown, status: number) {
  try {
    callback();
    throw new Error('Expected decoding to fail');
  } catch (error) {
    expect(error).toMatchObject({ status });
  }
}

describe('PNG decoding', () => {
  it.each([true, false])('preserves RGB samples with alpha=%s', (alpha) => {
    const image = createPngFixture(3, 2, alpha);
    const decoded = decodeImage(image.buffer, 'png', limits);
    expect(decoded).toMatchObject({ format: 'png', width: 3, height: 2 });
    expect(Buffer.from(decoded.pixels)).toEqual(image.pixels);
  });

  it('preserves RGB samples in fully transparent RGBA pixels', () => {
    const image = new PNG({ width: 1, height: 1 });
    image.data = Buffer.from([11, 22, 33, 0]);
    const decoded = decodeImage(PNG.sync.write(image), 'png', limits);
    expect(Buffer.from(decoded.pixels)).toEqual(image.data);
  });

  it('checks checksums including ancillary chunks', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const original = createPngFixture().buffer;
    const text = pngChunk('tEXt', Buffer.from('key\0value'));
    text[text.length - 1] = text[text.length - 1]! ^ 1;
    expectStatus(
      () =>
        decodeImage(
          Buffer.concat([
            original.subarray(0, 33),
            text,
            original.subarray(33),
          ]),
          'png',
          limits,
        ),
      400,
    );
  });

  it('rejects truncated pixel data and trailing bytes', () => {
    const image = createPngFixture().buffer;
    expectStatus(
      () => decodeImage(image.subarray(0, image.length - 2), 'png', limits),
      400,
    );
    expectStatus(
      () =>
        decodeImage(
          Buffer.concat([image, Buffer.from('hidden')]),
          'png',
          limits,
        ),
      400,
    );
  });

  it.each([
    (header: Buffer) => {
      header[8] = 16;
    },
    (header: Buffer) => {
      header[9] = 0;
    },
    (header: Buffer) => {
      header[12] = 1;
    },
  ])('rejects unsupported PNG variants', (change) => {
    expectStatus(
      () =>
        decodeImage(
          replacePngHeader(createPngFixture().buffer, change),
          'png',
          limits,
        ),
      415,
    );
  });

  it('rejects animation and transparency-key chunks', () => {
    const image = createPngFixture().buffer;
    for (const type of ['acTL', 'fcTL', 'fdAT', 'tRNS']) {
      const modified = Buffer.concat([
        image.subarray(0, 33),
        pngChunk(type, Buffer.alloc(8)),
        image.subarray(33),
      ]);
      expectStatus(() => decodeImage(modified, 'png', limits), 415);
    }
  });

  it('rejects forged dimensions before allocating decoded pixels', () => {
    const image = replacePngHeader(createPngFixture().buffer, (header) =>
      header.writeUInt32BE(100000, 0),
    );
    expectStatus(() => decodeImage(image, 'png', limits), 413);
  });

  it('rejects zero dimensions and invalid chunk lengths', () => {
    const image = createPngFixture().buffer;
    expectStatus(
      () =>
        decodeImage(
          replacePngHeader(image, (header) => header.writeUInt32BE(0, 0)),
          'png',
          limits,
        ),
      400,
    );
    const modified = Buffer.from(image);
    modified.writeUInt32BE(0xffffffff, 33);
    expectStatus(() => decodeImage(modified, 'png', limits), 400);
  });

  it('rejects inflated output exceeding the declared scanline length', () => {
    const image = createPngFixture().buffer;
    const modified = Buffer.concat([
      image.subarray(0, 33),
      pngChunk('IDAT', deflateSync(Buffer.alloc(10000))),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    expectStatus(() => decodeImage(modified, 'png', limits), 400);
  });

  it('rejects duplicate headers and excessive chunk counts', () => {
    const image = createPngFixture().buffer;
    expectStatus(
      () =>
        decodeImage(
          Buffer.concat([
            image.subarray(0, 33),
            image.subarray(8, 33),
            image.subarray(33),
          ]),
          'png',
          limits,
        ),
      400,
    );
    const chunks = Array.from({ length: 2048 }, () =>
      pngChunk('tEXt', Buffer.from('key\0value')),
    );
    expectStatus(
      () =>
        decodeImage(
          Buffer.concat([image.subarray(0, 33), ...chunks, image.subarray(33)]),
          'png',
          limits,
        ),
      413,
    );
  });
});

describe('BMP decoding', () => {
  it.each([
    [24, false],
    [24, true],
    [32, false],
    [32, true],
  ] as const)('handles %i-bit rows and topDown=%s', (bits, topDown) => {
    const image = createBmpFixture(3, 2, bits, topDown);
    const decoded = decodeImage(image.buffer, 'bmp', limits);
    expect(Buffer.from(decoded.pixels)).toEqual(image.pixels);
    expect(decoded).toMatchObject({ width: 3, height: 2, format: 'bmp' });
  });

  it('rejects corrupt offsets, sizes, planes and truncated data', () => {
    const image = createBmpFixture().buffer;
    for (const change of [
      (b: Buffer) => b.writeUInt32LE(55, 10),
      (b: Buffer) => b.writeUInt32LE(1, 2),
      (b: Buffer) => b.writeUInt16LE(2, 26),
      (b: Buffer) => b.writeUInt32LE(1, 34),
    ]) {
      const modified = Buffer.from(image);
      change(modified);
      expectStatus(() => decodeImage(modified, 'bmp', limits), 400);
    }
    expectStatus(
      () => decodeImage(image.subarray(0, image.length - 1), 'bmp', limits),
      400,
    );
  });

  it('rejects unsupported BMP encodings', () => {
    const image = createBmpFixture().buffer;
    for (const change of [
      (b: Buffer) => b.writeUInt32LE(108, 14),
      (b: Buffer) => b.writeUInt16LE(8, 28),
      (b: Buffer) => b.writeUInt32LE(1, 30),
    ]) {
      const modified = Buffer.from(image);
      change(modified);
      expectStatus(() => decodeImage(modified, 'bmp', limits), 415);
    }
  });

  it('rejects excessive dimensions before allocating pixel buffers', () => {
    const image = createBmpFixture().buffer;
    image.writeInt32LE(-2147483648, 22);
    expectStatus(() => decodeImage(image, 'bmp', limits), 413);
  });
});
