import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStorageConfiguration } from './config/storage.config.js';
import { QuarantineService } from './quarantine.service.js';

describe('Private quarantine storage', () => {
  let directory: string;
  let service: QuarantineService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'stego-quarantine-'));
    service = new QuarantineService(
      validateStorageConfiguration({
        QUARANTINE_DIR: directory,
        QUARANTINE_MAX_BYTES: 8,
        QUARANTINE_MAX_FILES: 1,
      }),
    );
    await service.onModuleInit();
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('stores exact original bytes with private names and modes', async () => {
    const key = randomUUID();
    await service.store(key, Buffer.from('image'));
    const file = join(directory, `${key}.bin`);
    expect(await readFile(file)).toEqual(Buffer.from('image'));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await service.files()).toMatchObject([{ key, size: 5 }]);
  });
  it('never overwrites existing files and bounds disk capacity', async () => {
    const key = randomUUID();
    await service.store(key, Buffer.from('first'));
    await expect(service.store(key, Buffer.from('new'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      service.store(randomUUID(), Buffer.from('second')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await readFile(join(directory, `${key}.bin`))).toEqual(
      Buffer.from('first'),
    );
    expect(await service.remove(key)).toBe(true);
    expect(await service.remove(key)).toBe(false);
    await expect(
      service.store(randomUUID(), Buffer.alloc(9)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await service.store(randomUUID(), Buffer.from('next'));
  });
  it('rejects traversal keys and symbolic links without touching targets', async () => {
    await expect(
      service.store('../outside', Buffer.from('data')),
    ).rejects.toThrow();
    const key = randomUUID();
    const target = join(directory, 'outside');
    await writeFile(target, 'private');
    await symlink(target, join(directory, `${key}.bin`));
    await expect(
      service.store(key, Buffer.from('data')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await readFile(target, 'utf8')).toBe('private');
  });
});
