import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuditEventInput } from './audit.types.js';
import { AuditEvent } from './entities/audit-event.entity.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepository: Repository<AuditEvent>,
  ) {}

  async record(input: AuditEventInput): Promise<void> {
    try {
      const event = this.auditRepository.create({
        eventType: input.eventType,
        actorId: input.actorId ?? null,
        subjectId: input.subjectId ?? null,
        action: input.action,
        resourceId: input.resourceId ?? null,
        decision: input.decision ?? null,
        reason: input.reason ?? null,
        requestId: input.requestId ?? null,
      });

      await this.auditRepository.save(event);
    } catch {
      /*
       * Audit failures must not expose secrets or block the security operation.
       */
      this.logger.warn({
        event: 'audit_write_failed',
        eventType: input.eventType,
        requestId: input.requestId ?? null,
      });
    }
  }
}
