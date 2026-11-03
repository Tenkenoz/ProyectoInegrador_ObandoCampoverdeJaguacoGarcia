import type { LsbResult } from '../../steganography/lsb/interfaces/lsb-result.js';

export interface SampleEvidence {
  filename: string;
  ground_truth: string;
  expected_http_status: 200 | 400 | 415;
  size_bytes: number;
  sha256: string;
  width?: number;
  height?: number;
  detection?: LsbResult;
}
