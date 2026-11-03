import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { SecurityRequest } from '../auth/interfaces/security-request.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  use(request: SecurityRequest, response: Response, next: NextFunction): void {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    let reported = false;
    const report = (status: number) => {
      if (reported) return;
      reported = true;
      const route: unknown = request.route?.path;
      const action =
        typeof route === 'string' && route.endsWith('/steganography/analyze')
          ? 'steganography.analyze'
          : typeof route === 'string' &&
              route.endsWith('/steganography/results/:id')
            ? 'steganography.results.read'
            : null;
      void this.audit
        .record({
          requestId: request.requestId!,
          subjectId: request.subject?.userId,
          resourceId: z.uuid().safeParse(request.params?.id).data ?? null,
          event: 'http.request',
          action,
          outcome:
            status >= 500 ? 'failed' : status >= 400 ? 'denied' : 'allowed',
          httpStatus: status,
          details: { method: request.method },
        })
        .catch(() => undefined);
    };
    response.once('finish', () => report(response.statusCode));
    response.once('close', () => {
      if (!response.writableFinished) report(499);
    });
    next();
  }
}
