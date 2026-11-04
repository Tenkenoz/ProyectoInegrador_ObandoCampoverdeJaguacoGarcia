import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import type { AuditEventInput } from './audit.types.js';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto.js';
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

  async findAll(query: ListAuditEventsQueryDto) {
    const { page, limit, eventType, actorId, subjectId, requestId, decision } =
      query;

    const where: FindOptionsWhere<AuditEvent> = {};

    if (eventType) {
      where.eventType = eventType;
    }

    if (actorId) {
      where.actorId = actorId;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (requestId) {
      where.requestId = requestId;
    }

    if (decision) {
      where.decision = decision;
    }

    const [data, total] = await this.auditRepository.findAndCount({
      where,

      skip: (page - 1) * limit,

      take: limit,

      order: {
        occurredAt: 'DESC',
      },
    });

    return {
      data,

      meta: {
        page,
        limit,
        total,

        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
