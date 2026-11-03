import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { StorageConfigModule } from './config/storage-config.module.js';
import { QuarantineService } from './quarantine.service.js';
import { QuarantineMaintenanceService } from './quarantine-maintenance.service.js';

@Module({
  imports: [StorageConfigModule, PersistenceModule, AuditModule],
  providers: [QuarantineService, QuarantineMaintenanceService],
  exports: [
    QuarantineService,
    QuarantineMaintenanceService,
    StorageConfigModule,
  ],
})
export class StorageModule {}
