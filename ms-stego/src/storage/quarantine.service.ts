import {
  Inject,
  Injectable,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { constants } from 'node:fs';
import {
  mkdir,
  lstat,
  open,
  readdir,
  realpath,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  STORAGE_CONFIG,
  type StorageConfiguration,
} from './config/storage.config.js';
import { AsyncMutex } from './utils/async-mutex.js';
import { parseStorageFilename, storageFilename } from './utils/storage-key.js';

export interface QuarantineFile {
  key: string;
  size: number;
  modifiedAt: Date;
}

@Injectable()
export class QuarantineService implements OnModuleInit {
  private root!: string;
  private identity!: { dev: number; ino: number };
  private readonly mutex = new AsyncMutex();

  constructor(
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfiguration,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await mkdir(this.config.QUARANTINE_DIR, { recursive: true, mode: 0o700 });
      const directory = await lstat(this.config.QUARANTINE_DIR);
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        (directory.mode & 0o077) !== 0 ||
        (process.getuid && directory.uid !== process.getuid())
      )
        throw new Error('Invalid quarantine directory');
      this.root = await realpath(this.config.QUARANTINE_DIR);
      this.identity = { dev: directory.dev, ino: directory.ino };
    } catch {
      throw new Error('The private quarantine directory is unavailable');
    }
  }

  async store(key: string, buffer: Buffer): Promise<void> {
    const name = storageFilename(key);
    return this.mutex.run(async () => {
      await this.verifyRoot();
      const entries = await this.scan();
      if (
        entries.length >= this.config.QUARANTINE_MAX_FILES ||
        entries.reduce((total, file) => total + file.size, 0) + buffer.length >
          this.config.QUARANTINE_MAX_BYTES
      ) {
        throw new ServiceUnavailableException(
          'Quarantine capacity is exhausted',
        );
      }
      const path = join(this.root, name);
      let created = false;
      try {
        const handle = await open(
          path,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        created = true;
        try {
          await handle.chmod(0o600);
          await handle.writeFile(buffer);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await this.syncDirectory();
      } catch {
        if (created) await unlink(path).catch(() => undefined);
        throw new ServiceUnavailableException(
          'Private image storage is unavailable',
        );
      }
    });
  }

  async remove(key: string): Promise<boolean> {
    const name = storageFilename(key);
    return this.mutex.run(async () => {
      await this.verifyRoot();
      const path = join(this.root, name);
      try {
        const file = await lstat(path);
        if (!file.isFile() || file.isSymbolicLink())
          throw new Error('Invalid quarantine entry');
        await unlink(path);
        await this.syncDirectory();
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw new ServiceUnavailableException(
          'Private image storage is unavailable',
        );
      }
    });
  }

  async exists(key: string): Promise<boolean> {
    const name = storageFilename(key);
    return this.mutex.run(async () => {
      await this.verifyRoot();
      try {
        const file = await lstat(join(this.root, name));
        if (!file.isFile() || file.isSymbolicLink())
          throw new Error('Invalid entry');
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw new ServiceUnavailableException(
          'Private image storage is unavailable',
        );
      }
    });
  }

  async files(): Promise<QuarantineFile[]> {
    return this.mutex.run(async () => {
      await this.verifyRoot();
      return this.scan();
    });
  }

  private async verifyRoot(): Promise<void> {
    if (!this.root)
      throw new ServiceUnavailableException(
        'Private image storage is unavailable',
      );
    try {
      const directory = await lstat(this.root);
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        directory.dev !== this.identity.dev ||
        directory.ino !== this.identity.ino ||
        (directory.mode & 0o077) !== 0 ||
        (process.getuid && directory.uid !== process.getuid())
      )
        throw new Error('Invalid directory');
    } catch {
      throw new ServiceUnavailableException(
        'Private image storage is unavailable',
      );
    }
  }

  private async syncDirectory(): Promise<void> {
    const directory = await open(
      this.root,
      constants.O_RDONLY | constants.O_DIRECTORY,
    );
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async scan(): Promise<QuarantineFile[]> {
    const result: QuarantineFile[] = [];
    try {
      for (const filename of await readdir(this.root)) {
        const key = parseStorageFilename(filename);
        const file = await lstat(join(this.root, filename));
        if (
          !key ||
          !file.isFile() ||
          file.isSymbolicLink() ||
          (file.mode & 0o077) !== 0 ||
          file.nlink !== 1
        )
          throw new Error('Invalid quarantine entry');
        result.push({ key, size: file.size, modifiedAt: file.mtime });
      }
      return result;
    } catch {
      throw new ServiceUnavailableException(
        'Private image storage is unavailable',
      );
    }
  }
}
