import { Global, Module, type INestApplicationContext } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import database from '../database/data-source.js';
import { StorageModule } from '../storage/storage.module.js';
import { QuarantineMaintenanceService } from '../storage/quarantine-maintenance.service.js';

@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: database }],
  exports: [getDataSourceToken()],
})
class CleanupDatabaseModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CleanupDatabaseModule,
    StorageModule,
  ],
})
class CleanupModule {}

let application: INestApplicationContext | undefined;
try {
  await database.initialize();
  application = await NestFactory.createApplicationContext(CleanupModule);
  const report = await application.get(QuarantineMaintenanceService).sweep();
  console.log(JSON.stringify(report));
} catch {
  console.error('Quarantine cleanup failed');
  process.exitCode = 1;
} finally {
  await application?.close();
  if (database.isInitialized) await database.destroy();
}
