import type { LsbConfiguration } from '../lsb/config/lsb.config.js';
import type { LsbResult } from '../lsb/interfaces/lsb-result.js';
import type { AppliedPolicy } from '../policy/interfaces/applied-policy.js';
import type { ImageFormat } from './image.js';

export interface NewAnalysis {
  userId: string;
  originalFilename: string;
  sha256: string;
  format: ImageFormat;
  sizeBytes: number;
  width: number;
  height: number;
  analyzedAt: string;
  detection: LsbResult;
  detectorParameters: LsbConfiguration;
  policy: AppliedPolicy;
}
