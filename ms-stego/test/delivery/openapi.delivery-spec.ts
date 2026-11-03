import { mkdir, writeFile } from 'node:fs/promises';
import request from 'supertest';
import { createDeliveryFixture } from '../helpers/delivery-fixture.js';

describe('OpenAPI delivery artifact', () => {
  let fixture: Awaited<ReturnType<typeof createDeliveryFixture>>;

  beforeAll(async () => {
    fixture = await createDeliveryFixture();
  });
  afterAll(async () => {
    await fixture?.dispose();
  });

  it('exports the runtime schema with public health and secured analysis routes', async () => {
    const server = fixture.app.getHttpServer();
    const json = await request(server).get('/docs-json').expect(200);
    const document = json.body;
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/v1/health',
      '/api/v1/steganography/analyze',
      '/api/v1/steganography/results/{id}',
    ]);
    expect(document.paths['/api/v1/health'].get.security).toBeUndefined();
    expect(document.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    const analyze = document.paths['/api/v1/steganography/analyze'].post;
    expect(analyze.security).toEqual([{ bearer: [] }]);
    expect(
      analyze.requestBody.content['multipart/form-data'].schema.required,
    ).toEqual(['file']);
    for (const code of ['200', '400', '401', '403', '413', '415', '503'])
      expect(analyze.responses[code]).toBeDefined();
    const read = document.paths['/api/v1/steganography/results/{id}'].get;
    expect(read.security).toEqual([{ bearer: [] }]);
    for (const code of ['200', '400', '401', '403', '404', '503'])
      expect(read.responses[code]).toBeDefined();
    const schemas = document.components.schemas;
    expect(schemas.AnalysisResultDto.properties.analysis_id).toBeDefined();
    expect(schemas.AnalysisResultDto.properties.quarantine).toBeDefined();
    const yaml = await request(server).get('/docs-yaml').expect(200);
    expect(yaml.text).toContain('openapi:');
    expect(yaml.text).toContain('/api/v1/steganography/results/{id}:');
    await mkdir('docs/openapi', { recursive: true });
    await writeFile('docs/openapi/stego.yaml', yaml.text);
  });
});
