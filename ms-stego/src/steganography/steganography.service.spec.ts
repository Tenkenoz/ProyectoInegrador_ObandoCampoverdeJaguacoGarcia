import { randomUUID, createHash } from 'node:crypto';
import { validateUploadConfiguration } from './config/upload.config.js';
import { LsbDetectorService } from './lsb/lsb-detector.service.js';
import { validateLsbConfiguration } from './lsb/config/lsb.config.js';
import { PolicyService } from './policy/policy.service.js';
import { validatePolicyConfiguration } from './policy/config/policy.config.js';
import { AnalysisPersistenceService } from './services/analysis-persistence.service.js';
import { validateStorageConfiguration } from '../storage/config/storage.config.js';
import { createSampleSuite } from '../tools/samples/sample-suite.js';
import { SteganographyService } from './steganography.service.js';

describe('Analysis input lifetime', () => {
  it('keeps a private bounded copy stable if the request buffer is cleared during processing', async () => {
    const suite = createSampleSuite();
    const original = Buffer.from(suite.files.get('original.png')!);
    const buffer = Buffer.from(original);
    const sample = suite.manifest.samples.find(
      (value) => value.filename === 'original.png',
    )!;
    let finish!: (value: unknown) => void;
    const analyze = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let saved: Buffer | undefined;
    let receivedHash: string | undefined;
    const save = vi.fn(async (input: { sha256: string }, bytes: Buffer) => {
      saved = Buffer.from(bytes);
      receivedHash = input.sha256;
      return { analysis_id: randomUUID() };
    });
    const service = new SteganographyService(
      validateUploadConfiguration({}),
      { analyze } as unknown as LsbDetectorService,
      new PolicyService(
        validatePolicyConfiguration({}),
        validateStorageConfiguration({}),
      ),
      { save } as unknown as AnalysisPersistenceService,
    );
    const result = service.analyzeImage(
      {
        originalname: 'original.png',
        mimetype: 'image/png',
        size: buffer.length,
        buffer,
      },
      { userId: randomUUID(), tokenVersion: 0 },
    );
    buffer.fill(0);
    finish({
      width: 128,
      height: 128,
      format: 'png',
      detection: sample.detection!,
      parameters: validateLsbConfiguration({}),
    });
    await result;
    expect(saved).toEqual(original);
    expect(receivedHash).toBe(
      createHash('sha256').update(original).digest('hex'),
    );
    const privateBuffer = save.mock.calls[0]![1];
    expect(privateBuffer).toEqual(Buffer.alloc(privateBuffer.length));
  });
});
