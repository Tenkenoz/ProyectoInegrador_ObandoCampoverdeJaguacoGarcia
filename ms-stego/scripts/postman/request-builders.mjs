export const origin = '{{stego_origin}}';
export const base = `${origin}/api/v1/steganography`;

export function event(listen, code) {
  return {
    listen,
    script: { type: 'text/javascript', exec: code.trim().split('\n') },
  };
}

export function requireVariables(keys) {
  return keys
    .map(
      (key) => `
if (!pm.variables.get(${JSON.stringify(key)})) {
  pm.test(${JSON.stringify(`Configurar la variable ${key} antes de ejecutar`)}, function () {
    pm.expect.fail('Completa esta variable localmente en el entorno seleccionado.');
  });
  pm.execution.skipRequest();
}`,
    )
    .join('\n');
}

export function statusTests(status) {
  return `pm.test('El código HTTP es ${status}', function () { pm.response.to.have.status(${status}); });`;
}

export function request({
  name,
  description,
  method = 'POST',
  path = `${base}/analyze`,
  token = 'access_token',
  body,
  status = 200,
  before = '',
  tests = '',
  required = [],
  manual = false,
  condition,
  headers = [],
}) {
  const prerequisites = [
    manual
      ? "if (pm.variables.get('run_manual_cases') !== 'true') { pm.execution.skipRequest(); }"
      : '',
    condition
      ? `if (pm.variables.get(${JSON.stringify(condition)}) !== 'true') {
  pm.test('Preparar la condición manual antes de ejecutar', function () { pm.expect.fail(${JSON.stringify(`Configura ${condition}=true después de preparar la condición descrita.`)}); });
  pm.execution.skipRequest();
}`
      : '',
    requireVariables([
      ...(token && !['tampered_token', 'malformed_token'].includes(token)
        ? [token]
        : []),
      ...required,
    ]),
    before,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    name,
    event: [
      event('prerequest', prerequisites),
      event('test', `${statusTests(status)}\n${tests}`),
    ],
    request: {
      method,
      header: headers,
      auth: token
        ? {
            type: 'bearer',
            bearer: [{ key: 'token', value: `{{${token}}}`, type: 'string' }],
          }
        : { type: 'noauth' },
      url: path,
      description,
      ...(body ? { body } : {}),
    },
    response: [],
  };
}

export function imageBody(filename, options = {}) {
  return {
    mode: 'formdata',
    formdata: [
      {
        key: options.key ?? 'file',
        type: 'file',
        src: filename,
        contentType:
          options.contentType ??
          (filename.endsWith('.bmp') ? 'image/bmp' : 'image/png'),
      },
    ],
  };
}

export function folder(name, description, item) {
  return { name, description, item };
}
