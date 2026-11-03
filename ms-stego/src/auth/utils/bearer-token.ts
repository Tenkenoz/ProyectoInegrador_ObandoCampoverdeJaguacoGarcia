import { UnauthorizedException } from '@nestjs/common';

export function extractBearerToken(
  header: unknown,
  rawHeaders: string[] = [],
): string {
  const count = rawHeaders.filter(
    (_, index) =>
      index % 2 === 0 && rawHeaders[index]?.toLowerCase() === 'authorization',
  ).length;
  if (count > 1 || typeof header !== 'string' || header.length > 8200) {
    throw new UnauthorizedException('A valid bearer token is required');
  }
  const match = /^Bearer ([^\s,]+)$/i.exec(header);
  if (!match)
    throw new UnauthorizedException('A valid bearer token is required');
  return match[1]!;
}
