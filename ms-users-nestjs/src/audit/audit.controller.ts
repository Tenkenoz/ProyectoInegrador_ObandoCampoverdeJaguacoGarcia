import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';
import { ROLE_ADMIN } from '../roles/role.constants.js';
import { AuditService } from './audit.service.js';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto.js';

@Controller('audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(ROLE_ADMIN)
  findAll(
    @Query()
    query: ListAuditEventsQueryDto,
  ) {
    return this.auditService.findAll(query);
  }
}
