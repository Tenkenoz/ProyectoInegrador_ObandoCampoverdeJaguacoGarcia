import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { AuditService } from './audit.service.js';
import { AuditMiddleware } from './audit.middleware.js';

@Module({
  imports: [PersistenceModule],
  providers: [AuditService, AuditMiddleware],
  exports: [AuditService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuditMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
