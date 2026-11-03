import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(@InjectDataSource() private readonly database: DataSource) {}

  async health() {
    try {
      await this.database.query('SELECT 1');
      return { status: 'ok', service: 'stego', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'stego',
        database: 'down',
      });
    }
  }
}
