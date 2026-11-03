export function createEnvironment(name, stegoOrigin) {
  const publicValues = {
    stego_origin: stegoOrigin,
    analysis_id: '',
    retained_analysis_id: '',
    missing_analysis_id: '00000000-0000-4000-8000-000000000001',
    expected_suspicious_action: 'cuarentena',
    expected_inconclusive_action: 'advertencia',
    upload_max_file_bytes: '5242880',
    oversized_file_bytes: '5242881',
    run_manual_cases: 'false',
    role_revoked_confirmed: 'false',
    auth_unavailable_confirmed: 'false',
    retention_cleanup_confirmed: 'false',
    revocation_fingerprint: '',
    last_request_id: '',
  };
  const secrets = [
    'access_token',
    'expired_token',
    'second_analyst_token',
    'admin_token',
    'user_token',
    'revocation_token',
  ];
  return {
    name,
    values: [
      ...Object.entries(publicValues).map(([key, value]) => ({
        key,
        value,
        enabled: true,
        type: 'default',
      })),
      ...secrets.map((key) => ({
        key,
        value: '',
        enabled: true,
        type: 'secret',
      })),
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_using: 'STEGO collection tooling',
  };
}
