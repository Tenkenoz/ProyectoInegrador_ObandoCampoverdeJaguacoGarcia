export const correlationTests = `
if (pm.request.url.toString().includes('/api/v1/')) {
  pm.test('La respuesta incluye un identificador de correlación válido', function () {
    pm.expect(pm.response.headers.get('X-Request-Id')).to.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  });
}
`;

export const analysisTests = `
if (pm.response.code === 200) {
  const result = pm.response.json();
  pm.test('El análisis tiene un identificador persistente', function () {
    pm.expect(result.analysis_id).to.match(/^[a-f0-9-]{36}$/i);
    pm.expect(result.upload_id).to.equal(result.analysis_id);
    pm.expect(result.legacy).to.equal(false);
  });
  pm.test('El resultado contiene evidencia y política', function () {
    pm.expect(result.technique).to.equal('lsb_chi_square_v1');
    pm.expect(result.sha256).to.match(/^[a-f0-9]{64}$/);
    pm.expect(result.policy.version).to.equal('stego_policy_v1');
    pm.expect(result.policy.action).to.equal(result.action);
    pm.expect(result.limitations).to.be.an('array').that.is.not.empty;
    pm.expect(result.detector_parameters).to.be.an('object');
  });
  pm.test('La respuesta no publica rutas ni claves de almacenamiento', function () {
    pm.expect(result.quarantine).to.have.all.keys('state', 'expires_at', 'deleted_at');
  });
  pm.environment.set('analysis_id', result.analysis_id);
  pm.variables.set('latest_analysis', JSON.stringify(result));
  if (result.quarantine.state === 'stored') pm.environment.set('retained_analysis_id', result.analysis_id);
}
`;

export function sampleTests(sample) {
  const expected = {
    sha256: sample.sha256,
    status: sample.detection.status,
    indicators: sample.detection.indicators,
  };
  return `${analysisTests}
if (pm.response.code === 200) {
  const result = pm.response.json();
  const expected = ${JSON.stringify(expected)};
  pm.test('El hash y la clasificación coinciden con la muestra versionada', function () {
    pm.expect(result.sha256).to.equal(expected.sha256);
    pm.expect(result.status).to.equal(expected.status);
  });
  pm.test('Los indicadores coinciden con el manifiesto de referencia', function () {
    Object.keys(expected.indicators).forEach(function (key) {
      const value = expected.indicators[key];
      if (value === null) pm.expect(result.indicators[key], key).to.equal(null);
      else pm.expect(result.indicators[key], key).to.be.closeTo(value, 1e-9);
    });
  });
  pm.test('La acción coincide con la política configurada para esta clasificación', function () {
    const action = result.status === 'sospechoso'
      ? pm.variables.get('expected_suspicious_action')
      : result.status === 'no_concluyente'
        ? pm.variables.get('expected_inconclusive_action') : 'advertencia';
    pm.expect(result.action).to.equal(action);
    pm.expect(result.quarantine.state).to.equal(action === 'cuarentena' ? 'stored' : 'none');
  });
}`;
}

export const resultTests = `
if (pm.response.code === 200) {
  const result = pm.response.json();
  pm.test('La consulta devuelve el análisis solicitado', function () {
    pm.expect(result.analysis_id).to.equal(pm.variables.get('analysis_id'));
    pm.expect(result.sha256).to.match(/^[a-f0-9]{64}$/);
  });
}
`;

export const errorTests = `
pm.test('El rechazo no devuelve un resultado de análisis', function () {
  const body = pm.response.json();
  pm.expect(body).not.to.have.property('analysis_id');
  pm.expect(body).not.to.have.property('indicators');
});
`;
