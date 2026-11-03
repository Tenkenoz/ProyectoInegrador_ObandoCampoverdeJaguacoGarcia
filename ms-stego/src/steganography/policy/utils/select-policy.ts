import type { LsbStatus } from '../../lsb/interfaces/lsb-result.js';
import type { PolicyConfiguration } from '../config/policy.config.js';
import type {
  AppliedPolicy,
  PolicyAction,
} from '../interfaces/applied-policy.js';

const statusLabels: Record<LsbStatus, string> = {
  sin_indicios: 'no_indicators',
  sospechoso: 'suspicious',
  no_concluyente: 'inconclusive',
  error: 'analysis_error',
};
const actionLabels: Record<PolicyAction, string> = {
  advertencia: 'warning',
  cuarentena: 'quarantine',
  rechazo: 'rejection',
};

export function selectPolicy(
  status: LsbStatus,
  config: PolicyConfiguration,
  retentionSeconds: number,
): AppliedPolicy {
  const action =
    status === 'error'
      ? 'rechazo'
      : status === 'sin_indicios'
        ? 'advertencia'
        : status === 'sospechoso'
          ? config.POLICY_SUSPICIOUS_ACTION
          : config.POLICY_INCONCLUSIVE_ACTION;
  return {
    version: 'stego_policy_v1',
    action,
    reason: `${statusLabels[status]}_${actionLabels[action]}`,
    retention_seconds: action === 'cuarentena' ? retentionSeconds : null,
    settings: {
      suspicious_action: config.POLICY_SUSPICIOUS_ACTION,
      inconclusive_action: config.POLICY_INCONCLUSIVE_ACTION,
    },
  };
}
