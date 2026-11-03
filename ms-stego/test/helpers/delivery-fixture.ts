import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppController } from '../../src/app.controller.js';
import { AppService } from '../../src/app.service.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { AUTH_CONFIG } from '../../src/auth/config/auth.config.js';
import { setupApp } from '../../src/setup-app.js';
import {
  IMAGE_WORKER_URL,
  UPLOAD_CONFIG,
  validateUploadConfiguration,
} from '../../src/steganography/config/upload.config.js';
import {
  LSB_CONFIG,
  validateLsbConfiguration,
} from '../../src/steganography/lsb/config/lsb.config.js';
import {
  POLICY_CONFIG,
  validatePolicyConfiguration,
} from '../../src/steganography/policy/config/policy.config.js';
import { SteganographyModule } from '../../src/steganography/steganography.module.js';
import {
  STORAGE_CONFIG,
  validateStorageConfiguration,
} from '../../src/storage/config/storage.config.js';
import { QuarantineScheduler } from '../../src/storage/quarantine-scheduler.js';
import { createAuthFixture } from './auth-fixture.js';
import {
  createPostgresFixture,
  fixtureDatabaseModule,
} from './postgres-fixture.js';

export async function createDeliveryFixture() {
  const postgres = await createPostgresFixture();
  let auth: Awaited<ReturnType<typeof createAuthFixture>> | undefined;
  let directory: string | undefined;
  let app: INestApplication | undefined;
  const dispose = async () => {
    try {
      await app?.close();
    } finally {
      try {
        await auth?.dispose();
      } finally {
        try {
          if (directory) await rm(directory, { recursive: true, force: true });
        } finally {
          await postgres.dispose();
        }
      }
    }
  };
  try {
    auth = await createAuthFixture();
    directory = await mkdtemp(join(tmpdir(), 'stego-delivery-'));
    const module = await Test.createTestingModule({
      imports: [
        fixtureDatabaseModule(postgres.database),
        AuthModule,
        SteganographyModule,
      ],
      controllers: [AppController],
      providers: [AppService],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(auth.config)
      .overrideProvider(UPLOAD_CONFIG)
      .useValue(validateUploadConfiguration({}))
      .overrideProvider(LSB_CONFIG)
      .useValue(validateLsbConfiguration({}))
      .overrideProvider(POLICY_CONFIG)
      .useValue(validatePolicyConfiguration({}))
      .overrideProvider(STORAGE_CONFIG)
      .useValue(validateStorageConfiguration({ QUARANTINE_DIR: directory }))
      .overrideProvider(QuarantineScheduler)
      .useValue({})
      .overrideProvider(IMAGE_WORKER_URL)
      .useValue(
        new URL(
          '../../dist/steganography/workers/image-decoder.worker.js',
          import.meta.url,
        ),
      )
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    setupApp(app);
    await app.init();
    return { app, auth, database: postgres.database, directory, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
