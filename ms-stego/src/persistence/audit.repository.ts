import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditEvent } from '../database/entities/audit-event.entity.js';
import type { AuditEntry } from '../audit/interfaces/audit-entry.js';
import { sanitizeAudit } from '../audit/utils/sanitize-audit.js';

@Injectable()
export class AuditRepository {
  constructor(@InjectDataSource() private readonly database: DataSource) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.database.getRepository(AuditEvent).insert(sanitizeAudit(entry));
  }
}
