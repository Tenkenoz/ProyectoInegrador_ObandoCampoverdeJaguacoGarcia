import type { LsbConfiguration } from '../config/lsb.config.js';
import type {
  ChannelEvidence,
  LsbIndicators,
  LsbReason,
  LsbStatus,
} from '../interfaces/lsb-result.js';

export function classifyLsb(
  indicators: LsbIndicators,
  channels: ChannelEvidence[],
  config: LsbConfiguration,
): { status: LsbStatus; reason: LsbReason } {
  if (indicators.pixel_count < config.LSB_MIN_PIXELS)
    return { status: 'no_concluyente', reason: 'insufficient_samples' };
  if (
    channels.length !== 3 ||
    channels.some(
      (channel) =>
        channel.eligible_pairs < config.LSB_MIN_PAIRS ||
        channel.coverage < config.LSB_MIN_COVERAGE,
    )
  ) {
    return { status: 'no_concluyente', reason: 'insufficient_pair_coverage' };
  }
  const probability = indicators.p_value;
  if (
    probability === null ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1 ||
    indicators.lsb_ratio === null ||
    !Number.isFinite(indicators.lsb_ratio)
  ) {
    return { status: 'error', reason: 'numerical_failure' };
  }
  if (
    probability >= config.LSB_SUSPICIOUS_THRESHOLD &&
    Math.abs(indicators.lsb_ratio - 0.5) <= config.LSB_BALANCE_TOLERANCE
  ) {
    return { status: 'sospechoso', reason: 'pair_balance_compatible' };
  }
  if (probability <= config.LSB_CLEAR_THRESHOLD)
    return { status: 'sin_indicios', reason: 'pair_balance_rejected' };
  return { status: 'no_concluyente', reason: 'ambiguous_evidence' };
}
