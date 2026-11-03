export type PolicyAction = 'advertencia' | 'cuarentena' | 'rechazo';

export interface AppliedPolicy {
  version: 'stego_policy_v1';
  action: PolicyAction;
  reason: string;
  retention_seconds: number | null;
  settings: {
    suspicious_action: PolicyAction;
    inconclusive_action: PolicyAction;
  };
}
