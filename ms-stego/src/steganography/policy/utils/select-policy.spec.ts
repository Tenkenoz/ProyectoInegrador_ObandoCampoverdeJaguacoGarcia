import { validatePolicyConfiguration } from '../config/policy.config.js';
import { selectPolicy } from './select-policy.js';

describe('Image policies', () => {
  it.each([
    ['sospechoso', 'cuarentena'],
    ['sin_indicios', 'advertencia'],
    ['no_concluyente', 'advertencia'],
    ['error', 'rechazo'],
  ] as const)('applies the default policy for %s', (status, action) => {
    expect(
      selectPolicy(status, validatePolicyConfiguration({}), 86400),
    ).toMatchObject({
      action,
      retention_seconds: action === 'cuarentena' ? 86400 : null,
    });
  });
  it.each(['advertencia', 'cuarentena', 'rechazo'] as const)(
    'supports explicit screening action %s without weakening error rejection',
    (action) => {
      const config = validatePolicyConfiguration({
        POLICY_SUSPICIOUS_ACTION: action,
        POLICY_INCONCLUSIVE_ACTION: action,
      });
      expect(selectPolicy('sospechoso', config, 60).action).toBe(action);
      expect(selectPolicy('no_concluyente', config, 60).action).toBe(action);
      expect(selectPolicy('error', config, 60).action).toBe('rechazo');
    },
  );
  it('rejects unknown policy actions', () => {
    expect(() =>
      validatePolicyConfiguration({ POLICY_SUSPICIOUS_ACTION: 'allow' }),
    ).toThrow();
  });
});
