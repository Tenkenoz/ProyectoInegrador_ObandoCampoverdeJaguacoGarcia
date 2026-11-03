import type { Request } from 'express';

export function clearUpload(request: Request): void {
  if (Buffer.isBuffer(request.file?.buffer)) request.file.buffer.fill(0);
  delete request.file;
}
