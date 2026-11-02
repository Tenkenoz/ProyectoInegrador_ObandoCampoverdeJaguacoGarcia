import { Injectable, NestMiddleware } from '@nestjs/common';

import { NextFunction, Request, Response } from 'express';

import { randomUUID } from 'node:crypto';

type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const received = req.header('x-request-id');

    const isValid = received && /^[A-Za-z0-9._-]{1,64}$/.test(received);

    const requestId = isValid ? received : randomUUID();

    req.requestId = requestId;

    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
