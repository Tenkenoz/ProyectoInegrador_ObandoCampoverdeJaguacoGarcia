import type { RgbChannel } from './rgb-histogram.js';

export type LsbStatus =
  'sin_indicios' | 'sospechoso' | 'no_concluyente' | 'error';
export type LsbReason =
  | 'pair_balance_compatible'
  | 'pair_balance_rejected'
  | 'insufficient_samples'
  | 'insufficient_pair_coverage'
  | 'ambiguous_evidence'
  | 'invalid_pixel_data'
  | 'numerical_failure';

export interface ChannelEvidence {
  channel: RgbChannel;
  sample_count: number;
  eligible_pairs: number;
  coverage: number;
  chi_square: number;
  p_value: number | null;
  lsb_ratio: number;
}

export interface LsbIndicators {
  chi_square: number | null;
  degrees_of_freedom: number;
  p_value: number | null;
  anomaly_score: number | null;
  lsb_ratio: number | null;
  threshold: number;
  clear_threshold: number;
  balance_tolerance: number;
  pixel_count: number;
  sample_count: number;
  coverage: number;
}

export interface LsbResult {
  technique: 'lsb_chi_square_v1';
  status: LsbStatus;
  reason: LsbReason;
  indicators: LsbIndicators;
  channels: ChannelEvidence[];
  limitations: string[];
}
