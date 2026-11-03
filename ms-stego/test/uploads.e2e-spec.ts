import { createPersistenceFixture } from './helpers/persistence-fixture.js';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { AUTH_CONFIG } from '../src/auth/config/auth.config.js';
import { setupApp } from '../src/setup-app.js';
import {
  IMAGE_WORKER_URL,
  UPLOAD_CONFIG,
  validateUploadConfiguration,
} from '../src/steganography/config/upload.config.js';
import { UploadBoundaryInterceptor } from '../src/steganography/interceptors/upload-boundary.interceptor.js';
import { LsbDetectorService } from '../src/steganography/lsb/lsb-detector.service.js';
import { UploadCapacityService } from '../src/steganography/services/upload-capacity.service.js';
import { SteganographyModule } from '../src/steganography/steganography.module.js';
import { createAuthFixture } from './helpers/auth-fixture.js';
import {
  createBmpFixture,
  createPngFixture,
  pngChunk,
  replacePngHeader,
} from './helpers/image-fixture.js';

const config = validateUploadConfiguration({
  UPLOAD_MAX_FILE_BYTES: 1024,
  IMAGE_MAX_WIDTH: 8,
  IMAGE_MAX_HEIGHT: 8,
  IMAGE_MAX_PIXELS: 32,
  UPLOAD_MAX_CONCURRENT: 1,
});
const workerUrl = new URL(
  '../dist/steganography/workers/image-decoder.worker.js',
  import.meta.url,
);
const endpoint = '/api/v1/steganography/analyze';

describe('Authorized image uploads', () => {
  let auth: Awaited<ReturnType<typeof createAuthFixture>>;
  let app: INestApplication;
  let persistence: ReturnType<typeof createPersistenceFixture>;
  let token: string;
  let decoder: LsbDetectorService;
  let capacity: UploadCapacityService;
  let decode: ReturnType<typeof vi.spyOn>;
  let boundary: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    auth = await createAuthFixture();
  });
  beforeEach(async () => {
    auth.state.mode = 'allow';
    auth.state.scope = 'own';
    auth.state.jwksUnavailable = false;
    token = await auth.signing.issue();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    persistence = createPersistenceFixture();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const builder = Test.createTestingModule({
      imports: [AuthModule, SteganographyModule],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(auth.config)
      .overrideProvider(UPLOAD_CONFIG)
      .useValue(config)
      .overrideProvider(IMAGE_WORKER_URL)
      .useValue(workerUrl);
    const module = await persistence.configure(builder).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    decoder = module.get(LsbDetectorService);
    capacity = module.get(UploadCapacityService);
    decode = vi.spyOn(decoder, 'analyze');
    boundary = vi.spyOn(UploadBoundaryInterceptor.prototype, 'intercept');
  });
  afterEach(async () => {
    await app.close();
    await persistence.dispose();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await auth.dispose();
  });

  it.each(['png', 'bmp'] as const)(
    'analyzes a real %s image and reports insufficient evidence',
    async (format) => {
      const image = format === 'png' ? createPngFixture() : createBmpFixture();
      const response = await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', image.buffer, {
          filename: `original.${format}`,
          contentType: `image/${format}`,
        })
        .expect(200);
      expect(response.body).toMatchObject({
        status: 'no_concluyente',
        user_id: auth.signing.userId,
        original_filename: `original.${format}`,
        format,
        width: 3,
        height: 2,
        size_bytes: image.buffer.length,
        sha256: createHash('sha256').update(image.buffer).digest('hex'),
      });
      expect(response.body.filename).toBe(
        `${response.body.upload_id}.${format}`,
      );
      expect(response.body.upload_id).toMatch(/^[a-f0-9-]{36}$/);
      expect(response.body.analysis_id).toBe(response.body.upload_id);
      expect(response.body.indicators).toMatchObject({
        pixel_count: 6,
        sample_count: 18,
        p_value: null,
      });
      expect(response.body.technique).toBe('lsb_chi_square_v1');
    },
  );

  it('accepts common BMP aliases and uppercase extensions', async () => {
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', createBmpFixture().buffer, {
        filename: 'image.BMP',
        contentType: 'image/x-ms-bmp',
      })
      .expect(200);
  });

  it('rejects missing authentication before receiving multipart content', async () => {
    await request(app.getHttpServer())
      .post(endpoint)
      .attach('file', createPngFixture().buffer, 'image.png')
      .expect(401);
    expect(boundary).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it.each(['deny', 'unavailable', 'session_revoked'] as const)(
    'does not receive or decode images when AUTH reports %s',
    async (mode) => {
      auth.state.mode = mode;
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', createPngFixture().buffer, 'image.png')
        .expect(mode === 'deny' ? 403 : mode === 'session_revoked' ? 401 : 503);
      expect(boundary).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['image.jpg', 'image/jpeg', 415],
    ['image.png', 'application/octet-stream', 415],
    ['image.bmp', 'image/png', 400],
  ] as const)(
    'rejects declared metadata %s / %s',
    async (filename, contentType, status) => {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', createPngFixture().buffer, { filename, contentType })
        .expect(status);
      expect(decode).not.toHaveBeenCalled();
    },
  );

  it('rejects spoofed extensions and contradictory supported signatures', async () => {
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from([255, 216, 255, 224, 0, 0, 0, 0]), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(415);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', createBmpFixture().buffer, {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects empty and corrupt images', async () => {
    const image = createPngFixture().buffer;
    for (const buffer of [
      Buffer.alloc(0),
      image.subarray(0, image.length - 2),
    ]) {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, {
          filename: 'image.png',
          contentType: 'image/png',
        })
        .expect(400);
    }
  });

  it('accepts exactly the byte limit and rejects larger files before decoding', async () => {
    const original = createPngFixture().buffer;
    const text = pngChunk(
      'tEXt',
      Buffer.from(
        'key\0' +
          'x'.repeat(config.UPLOAD_MAX_FILE_BYTES - original.length - 16),
      ),
    );
    const exact = Buffer.concat([
      original.subarray(0, 33),
      text,
      original.subarray(33),
    ]);
    expect(exact.length).toBe(config.UPLOAD_MAX_FILE_BYTES);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', exact, {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(200);
    decode.mockClear();
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.alloc(config.UPLOAD_MAX_FILE_BYTES + 1), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects excessive width, height and pixel counts', async () => {
    for (const [width, height] of [
      [9, 1],
      [1, 9],
      [8, 8],
    ]) {
      const buffer = replacePngHeader(createPngFixture().buffer, (header) => {
        header.writeUInt32BE(width!, 0);
        header.writeUInt32BE(height!, 4);
      });
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, {
          filename: 'image.png',
          contentType: 'image/png',
        })
        .expect(413);
    }
  });

  it('rejects unsupported PNG and BMP variants', async () => {
    const png = replacePngHeader(createPngFixture().buffer, (header) => {
      header[8] = 16;
    });
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', png, { filename: 'image.png', contentType: 'image/png' })
      .expect(415);
    const bmp = createBmpFixture().buffer;
    bmp.writeUInt32LE(1, 30);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', bmp, { filename: 'image.bmp', contentType: 'image/bmp' })
      .expect(415);
  });

  it('rejects unexpected files, multiple files and additional fields', async () => {
    const buffer = createPngFixture().buffer;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('other', buffer, 'image.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'image.png')
      .attach('file', buffer, 'second.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .field('user_id', auth.signing.userId)
      .attach('file', buffer, 'image.png')
      .expect(400);
    expect(decode).not.toHaveBeenCalled();
  });

  it('rejects missing files, non-multipart requests and malformed boundaries', async () => {
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ file: 'image' })
      .expect(415);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'multipart/form-data; boundary=empty')
      .send('--empty--\r\n')
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'multipart/form-data')
      .send('invalid')
      .expect(400);
  });

  it('releases upload capacity after parsing and decoding errors', async () => {
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('wrong', Buffer.from('invalid'), 'image.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', createPngFixture().buffer.subarray(0, 33), 'image.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', createPngFixture().buffer, 'image.png')
      .expect(200);
  });

  it('rejects excess concurrency before receiving the file', async () => {
    const release = capacity.acquire();
    try {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', createPngFixture().buffer, 'image.png')
        .expect(503);
      expect(decode).not.toHaveBeenCalled();
    } finally {
      release();
    }
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', createPngFixture().buffer, 'image.png')
      .expect(200);
  });

  it('documents the multipart contract and validation response', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const operation = response.body.paths[endpoint].post;
    expect(operation.requestBody.content['multipart/form-data']).toBeDefined();
    expect(operation.security).toEqual([{ bearer: [] }]);
    for (const code of ['200', '400', '401', '403', '413', '415', '503'])
      expect(operation.responses[code]).toBeDefined();
  });
});
