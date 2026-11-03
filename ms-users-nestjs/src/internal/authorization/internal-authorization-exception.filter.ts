import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class InternalAuthorizationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(
    InternalAuthorizationExceptionFilter.name,
  );

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.SERVICE_UNAVAILABLE;

    let code =
      status === HttpStatus.BAD_REQUEST
        ? 'invalid_authorization_request'
        : 'authorization_unavailable';

    let message =
      status === HttpStatus.BAD_REQUEST
        ? 'Invalid authorization request'
        : 'Authorization is unavailable';

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        if ('code' in body && typeof body.code === 'string') {
          code = body.code;
        }

        if ('message' in body) {
          const value = body.message;
          message = Array.isArray(value) ? value.join('; ') : String(value);
        }
      }
    } else {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      code = 'authorization_unavailable';
      message = 'Authorization is unavailable';
    }

    response.status(status).json({
      code,
      message,
    });
  }
}
