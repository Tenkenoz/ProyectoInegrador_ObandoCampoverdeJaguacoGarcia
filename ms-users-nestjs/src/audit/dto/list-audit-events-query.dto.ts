import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto/pagination-query.dto.js';
import { AUDIT_DECISIONS, type AuditDecision } from '../audit.types.js';

export class ListAuditEventsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventType?: string;

  @IsOptional()
  @IsUUID('4')
  actorId?: string;

  @IsOptional()
  @IsUUID('4')
  subjectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @IsOptional()
  @IsIn(AUDIT_DECISIONS)
  decision?: AuditDecision;
}
