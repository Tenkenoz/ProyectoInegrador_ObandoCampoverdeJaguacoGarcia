import { createPersistenceFixture } from './helpers/persistence-fixture.js';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { AUTH_CONFIG } from '../src/auth/config/auth.config.js';
import { setupApp } from '../src/setup-app.js';
import {
  IMAGE_WORKER_URL,
  UPLOAD_CONFIG,
  validateUploadConfiguration,
} from '../src/steganography/config/upload.config.js';
import {
  LSB_CONFIG,
  validateLsbConfiguration,
} from '../src/steganography/lsb/config/lsb.config.js';
import { SteganographyModule } from '../src/steganography/steganography.module.js';
import { createSampleSuite } from '../src/tools/samples/sample-suite.js';
import { createAuthFixture } from './helpers/auth-fixture.js';

const endpoint = '/api/v1/steganography/analyze';

describe('Reproducible LSB analysis through HTTP', () => {
  let auth: Awaited<ReturnType<typeof createAuthFixture>>;
  let suite: ReturnType<typeof createSampleSuite>;
  let app: INestApplication;
  let persistence: ReturnType<typeof createPersistenceFixture>;
  let token: string;

  beforeAll(async () => {
    auth = await createAuthFixture();
    suite = createSampleSuite();
  });
  beforeEach(async () => {
    auth.state.mode = 'allow';
    auth.state.scope = 'own';
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
      .useValue(validateUploadConfiguration({}))
      .overrideProvider(LSB_CONFIG)
      .useValue(validateLsbConfiguration({}))
      .overrideProvider(IMAGE_WORKER_URL)
      .useValue(
        new URL(
          '../dist/steganography/workers/image-decoder.worker.js',
          import.meta.url,
        ),
      );
    const module = await persistence.configure(builder).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    await persistence.dispose();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await auth.dispose();
  });

  it.each([
    'original.png',
    'original.bmp',
    'lsb-payload.png',
    'lsb-payload.bmp',
    'noise-control.png',
    'small.png',
    'flat-control.png',
  ])('reproduces the recorded evidence for %s', async (filename) => {
    const sample = suite.manifest.samples.find(
      (value) => value.filename === filename,
    )!;
    const format = filename.endsWith('.bmp') ? 'bmp' : 'png';
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', suite.files.get(filename)!, {
        filename,
        contentType: `image/${format}`,
      })
      .expect(200);
    expect(response.body.status).toBe(sample.detection!.status);
    expect(response.body.reason).toBe(sample.detection!.reason);
    expect(response.body.indicators).toEqual(sample.detection!.indicators);
    expect(response.body.channels).toEqual(sample.detection!.channels);
    expect(response.body.sha256).toBe(sample.sha256);
    expect(response.body.technique).toBe('lsb_chi_square_v1');
    expect(response.body.limitations.join(' ')).toContain('not proof');
    expect(response.body.analysis_id).toBe(response.body.upload_id);
  });

  it.each([
    ['corrupt.png', 400],
    ['false-extension.png', 415],
  ] as const)(
    'rejects the reproducible invalid sample %s',
    async (filename, status) => {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', suite.files.get(filename)!, {
          filename,
          contentType: 'image/png',
        })
        .expect(status);
    },
  );

  it('exposes classification and nullable metrics in OpenAPI', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const schemas = response.body.components.schemas;
    expect(schemas.AnalysisResultDto.properties.status.enum).toEqual([
      'sin_indicios',
      'sospechoso',
      'no_concluyente',
      'error',
    ]);
    expect(schemas.LsbIndicatorsDto.properties.p_value.nullable).toBe(true);
  });
});
