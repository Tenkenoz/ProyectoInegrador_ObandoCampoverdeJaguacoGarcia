import { HttpException } from '@nestjs/common';

export function getExceptionCode(error: unknown, fallback: string): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();

    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
    ) {
      return body.code;
    }
  }

  return fallback;
}
