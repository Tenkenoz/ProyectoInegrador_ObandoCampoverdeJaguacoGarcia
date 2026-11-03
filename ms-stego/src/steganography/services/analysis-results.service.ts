import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedSubject } from '../../auth/interfaces/authenticated-subject.js';
import type { AuthorizationGrant } from '../../auth/interfaces/authorization.js';
import { assertResourceOwnership } from '../../auth/utils/resource-ownership.js';
import { AnalysisRepository } from '../../persistence/analysis.repository.js';
import { mapStoredAnalysis } from '../utils/map-stored-analysis.js';

@Injectable()
export class AnalysisResultsService {
  constructor(
    @Inject(AnalysisRepository) private readonly repository: AnalysisRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async find(
    id: string,
    subject: AuthenticatedSubject,
    grant: AuthorizationGrant,
    requestId: string,
  ) {
    if (
      !grant.allowed ||
      grant.subject_id !== subject.userId ||
      grant.resource_id !== id ||
      grant.action !== 'steganography.results.read' ||
      (grant.scope !== 'own' && grant.scope !== 'any')
    )
      throw new ForbiddenException('Invalid resource authorization');
    let row;
    try {
      row = await this.repository.findById(id);
    } catch {
      await this.audit.record({
        requestId,
        subjectId: subject.userId,
        resourceId: id,
        event: 'persistence.unavailable',
        action: 'steganography.results.read',
        outcome: 'failed',
        httpStatus: 503,
      });
      throw new ServiceUnavailableException(
        'Analysis persistence is unavailable',
      );
    }
    if (!row) throw new NotFoundException('Analysis not found');
    try {
      assertResourceOwnership(grant, row.userId);
    } catch {
      await this.audit.record({
        requestId,
        subjectId: subject.userId,
        resourceId: id,
        event: 'analysis.denied',
        action: 'steganography.results.read',
        outcome: 'denied',
        httpStatus: 403,
      });
      throw new ForbiddenException('Access to this analysis is forbidden');
    }
    try {
      await this.repository.recordRead(id, subject.userId, requestId);
    } catch {
      throw new ServiceUnavailableException(
        'Analysis access could not be audited',
      );
    }
    this.audit.log({
      requestId,
      subjectId: subject.userId,
      resourceId: id,
      event: 'analysis.read',
      action: 'steganography.results.read',
      outcome: 'allowed',
      httpStatus: 200,
      details: { legacy: row.metadata === null },
    });
    return mapStoredAnalysis(row);
  }
}
