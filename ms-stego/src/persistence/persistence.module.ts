import { Module } from '@nestjs/common';
import { AnalysisRepository } from './analysis.repository.js';
import { AuditRepository } from './audit.repository.js';

@Module({
  providers: [AnalysisRepository, AuditRepository],
  exports: [AnalysisRepository, AuditRepository],
})
export class PersistenceModule {}
