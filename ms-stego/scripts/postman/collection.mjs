import {
  base,
  origin,
  event,
  folder,
  imageBody,
  request,
} from './request-builders.mjs';
import {
  analysisTests,
  correlationTests,
  errorTests,
  resultTests,
  sampleTests,
} from './assertions.mjs';

const image = imageBody('samples/lsb-payload.png');
const readPath = `${base}/results/{{analysis_id}}`;

function authenticationFolder() {
  return folder(
    '01 · T03 — Autenticación',
    'Comprueba el rechazo antes de procesar archivos. Completa expired_token con un token realmente vencido del mismo AUTH.',
    [
      request({
        name: 'T03 · Rechazar una solicitud sin JWT',
        description: 'Debe devolver 401 sin autenticar ni analizar.',
        token: null,
        status: 401,
        tests: errorTests,
      }),
      request({
        name: 'T03 · Rechazar un JWT malformado',
        description:
          'Usa un valor inválido local; no requiere un token emitido por AUTH.',
        token: 'malformed_token',
        before: "pm.variables.set('malformed_token', 'invalid.token.value');",
        status: 401,
        tests: errorTests,
      }),
      request({
        name: 'T03 · Rechazar una firma manipulada',
        description:
          'Modifica la firma del token válido solo en el ámbito temporal de la ejecución. No guarda el JWT en la colección.',
        token: 'tampered_token',
        required: ['access_token'],
        before: `
const parts = pm.variables.get('access_token').split('.');
if (parts.length !== 3) throw new Error('access_token debe contener un JWT válido.');
parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
pm.variables.set('tampered_token', parts.join('.'));
`,
        status: 401,
        tests: errorTests,
      }),
      request({
        name: 'T03 · Rechazar un JWT vencido',
        description:
          'Requiere expired_token; no se fabrica una fecha de expiración sin una firma válida.',
        token: 'expired_token',
        status: 401,
        tests: errorTests,
      }),
    ],
  );
}

function validationFolder() {
  const invalid = (name, description, body, status, before = '') =>
    request({
      name: `T10 · ${name}`,
      description,
      body,
      status,
      before,
      tests: errorTests,
    });
  return folder(
    '03 · T10 — Validación de archivos',
    'Ejecuta pnpm postman:files antes de usar los archivos de postman/files. No fijes Content-Type manualmente para multipart: Postman genera su boundary.',
    [
      invalid(
        'Rechazar una imagen corrupta',
        'PNG truncado: se espera 400.',
        imageBody('samples/corrupt.png'),
        400,
      ),
      invalid(
        'Rechazar una extensión falsa',
        'GIF renombrado como PNG: se espera 415 por formato real no admitido.',
        imageBody('samples/false-extension.png'),
        415,
      ),
      invalid(
        'Rechazar un archivo demasiado grande',
        'Archivo local con un byte más que UPLOAD_MAX_FILE_BYTES. Ajusta el generador y el entorno si cambia el límite.',
        imageBody('postman/files/oversized.png'),
        413,
        `
if (Number(pm.variables.get('oversized_file_bytes')) <= Number(pm.variables.get('upload_max_file_bytes'))) {
  pm.test('La muestra supera el límite configurado', function () { pm.expect.fail('Regenera la muestra y actualiza oversized_file_bytes.'); });
  pm.execution.skipRequest();
}`,
      ),
      invalid(
        'Rechazar un archivo vacío',
        'Archivo de cero bytes: se espera 400.',
        imageBody('postman/files/empty.png'),
        400,
      ),
      invalid(
        'Rechazar una solicitud sin archivo',
        'Multipart sin archivo y con un campo de texto no admitido: se espera 400.',
        {
          mode: 'formdata',
          formdata: [{ key: 'unused', type: 'text', value: 'value' }],
        },
        400,
      ),
      invalid(
        'Rechazar un campo de archivo incorrecto',
        'El campo correcto se llama file; image debe rechazarse con 400.',
        imageBody('samples/original.png', { key: 'image' }),
        400,
      ),
      request({
        name: 'T10 · Rechazar un MIME de solicitud no admitido',
        description:
          'Envía texto con Content-Type: text/plain. El endpoint exige multipart/form-data y devuelve 415.',
        body: {
          mode: 'raw',
          raw: 'archivo-no-admitido',
          options: { raw: { language: 'text' } },
        },
        headers: [{ key: 'Content-Type', value: 'text/plain' }],
        status: 415,
        tests: errorTests,
      }),
      invalid(
        'Rechazar firma y formato inconsistentes',
        'El archivo mismatched.bmp contiene un PNG, pero se declara BMP: se espera 400.',
        imageBody('postman/files/mismatched.bmp'),
        400,
      ),
      request({
        name: 'T10 · Rechazar JSON en lugar de multipart',
        description:
          'El endpoint acepta multipart/form-data; JSON devuelve 415.',
        body: {
          mode: 'raw',
          raw: '{}',
          options: { raw: { language: 'json' } },
        },
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        status: 415,
        tests: errorTests,
      }),
    ],
  );
}

function resultsFolder() {
  return folder(
    '04 · Resultados persistentes',
    'La primera solicitud crea un análisis propio y actualiza analysis_id. Se puede ejecutar esta carpeta de forma independiente.',
    [
      request({
        name: 'Crear un análisis propio para consultar',
        description:
          'Guarda el identificador devuelto en el entorno; no conserva el contenido del archivo en variables.',
        body: image,
        tests: analysisTests,
      }),
      request({
        name: 'Consultar el análisis propio',
        description:
          'Revalida permisos vigentes y propiedad. La evidencia debe coincidir con la respuesta del POST.',
        method: 'GET',
        path: readPath,
        required: ['analysis_id'],
        tests: `${resultTests}
if (pm.response.code === 200 && pm.variables.get('latest_analysis')) {
  pm.test('La evidencia persistida conserva hash, métricas y política', function () {
    const expected = JSON.parse(pm.variables.get('latest_analysis'));
    const actual = pm.response.json();
    ['sha256', 'indicators', 'policy', 'analyzed_at', 'status', 'action'].forEach(function (key) { pm.expect(actual[key]).to.deep.equal(expected[key]); });
  });
}`,
      }),
      request({
        name: 'Rechazar una consulta sin JWT',
        description: 'El resultado almacenado sigue requiriendo autenticación.',
        method: 'GET',
        path: readPath,
        token: null,
        required: ['analysis_id'],
        status: 401,
        tests: errorTests,
      }),
      request({
        name: 'Rechazar un identificador malformado',
        description: 'Se espera 400 después de verificar el JWT.',
        method: 'GET',
        path: `${base}/results/not-a-uuid`,
        status: 400,
        tests: errorTests,
      }),
      request({
        name: 'Consultar un identificador inexistente',
        description:
          'missing_analysis_id debe ser un UUID que no exista en la base de datos; se espera 404 tras autorizar la consulta.',
        method: 'GET',
        path: `${base}/results/{{missing_analysis_id}}`,
        required: ['missing_analysis_id'],
        status: 404,
        tests: errorTests,
      }),
      request({
        name: 'Comprobar que no existe una descarga pública',
        description:
          'La cuarentena no expone una ruta estática. Una ruta inventada devuelve 404.',
        method: 'GET',
        path: `${origin}/api/v1/steganography/files/{{analysis_id}}`,
        required: ['analysis_id'],
        status: 404,
        tests: errorTests,
      }),
    ],
  );
}

function manualFolders() {
  return [
    folder(
      '05 · T04 y T11 — Roles y propiedad reales',
      'Ejecución manual: run_manual_cases=true. Requiere tokens reales de dos ANALYST distintos, un ADMIN y un USER. La primera petición crea el recurso del primer ANALYST.',
      [
        request({
          name: 'T11 · Crear el análisis del primer ANALYST',
          description: 'access_token debe pertenecer al propietario inicial.',
          manual: true,
          body: image,
          tests: analysisTests,
        }),
        request({
          name: 'T11 · Denegar la consulta a otro ANALYST',
          description:
            'second_analyst_token debe pertenecer a un usuario distinto. No edites el propietario en la base de datos durante la prueba final.',
          manual: true,
          token: 'second_analyst_token',
          required: ['analysis_id'],
          method: 'GET',
          path: readPath,
          status: 403,
          tests: errorTests,
        }),
        request({
          name: 'T11 · Permitir la consulta al ADMIN',
          description: 'AUTH debe conceder scope=any al ADMIN.',
          manual: true,
          token: 'admin_token',
          required: ['analysis_id'],
          method: 'GET',
          path: readPath,
          tests: resultTests,
        }),
        request({
          name: 'T04 · Denegar el análisis al rol USER',
          description:
            'user_token debe ser un JWT válido de un usuario sin permisos de análisis.',
          manual: true,
          token: 'user_token',
          body: image,
          status: 403,
          tests: errorTests,
        }),
      ],
    ),
    folder(
      '06 · T07 — Revocación con el mismo JWT',
      'Ejecuta las dos peticiones por separado. Primero permite el análisis; luego Jonathan retira el rol. No renueves el JWT. Marca role_revoked_confirmed=true antes de la segunda petición. La huella almacenada es SHA-256, nunca el token.',
      [
        request({
          name: 'T07 · Analizar antes de retirar el rol',
          description:
            'Usa revocation_token con un rol vigente. Guarda solo la huella del token en el entorno para compararla después.',
          manual: true,
          token: 'revocation_token',
          body: image,
          tests: `${analysisTests}
if (pm.response.code === 200) pm.environment.set('revocation_fingerprint', require('crypto-js').SHA256(pm.variables.get('revocation_token')).toString());`,
        }),
        request({
          name: 'T07 · Repetir después de retirar el rol',
          description:
            'Reutiliza exactamente revocation_token. AUTH debe devolver una decisión denegada: se espera 403.',
          manual: true,
          condition: 'role_revoked_confirmed',
          token: 'revocation_token',
          required: ['revocation_fingerprint'],
          body: image,
          before: `
const fingerprint = require('crypto-js').SHA256(pm.variables.get('revocation_token')).toString();
if (fingerprint !== pm.variables.get('revocation_fingerprint')) {
  pm.test('El JWT sigue siendo el mismo', function () { pm.expect.fail('El token cambió; repite la primera solicitud.'); });
  pm.execution.skipRequest();
}`,
          status: 403,
          tests: `${errorTests}
pm.test('Se reutilizó el mismo JWT', function () { pm.expect(require('crypto-js').SHA256(pm.variables.get('revocation_token')).toString()).to.equal(pm.variables.get('revocation_fingerprint')); });`,
        }),
      ],
    ),
    folder(
      '07 · Dependencias y retención',
      'Ejecución manual sobre un entorno controlado. La colección no detiene servicios ni altera fechas en la base de datos. Prepara la condición externamente y marca su variable de confirmación.',
      [
        request({
          name: 'Fallar de forma segura cuando AUTH está inaccesible',
          description:
            'Detén o aísla AUTH con ayuda de Jonathan/Erick. Conserva un JWT todavía válido, marca auth_unavailable_confirmed=true y espera 503. Revisa la auditoría y que no se haya creado un análisis.',
          manual: true,
          condition: 'auth_unavailable_confirmed',
          body: image,
          status: 503,
          tests: errorTests,
        }),
        request({
          name: 'Consultar después de eliminar el original vencido',
          description:
            'Ejecuta primero un análisis en cuarentena. Espera su vencimiento y la limpieza; marca retention_cleanup_confirmed=true. El resultado debe seguir disponible con state=deleted.',
          manual: true,
          condition: 'retention_cleanup_confirmed',
          method: 'GET',
          path: `${base}/results/{{retained_analysis_id}}`,
          required: ['retained_analysis_id'],
          tests: `
if (pm.response.code === 200) {
  const result = pm.response.json();
  pm.test('El original fue eliminado y el resultado permanece', function () {
    pm.expect(result.analysis_id).to.equal(pm.variables.get('retained_analysis_id'));
    pm.expect(result.quarantine.state).to.equal('deleted');
    pm.expect(result.quarantine.deleted_at).to.be.a('string');
    pm.expect(result.sha256).to.match(/^[a-f0-9]{64}$/);
  });
}`,
        }),
      ],
    ),
  ];
}

export function createCollection(manifest) {
  const sampleNames = {
    'original.png': 'Original PNG sin carga conocida',
    'lsb-payload.png': 'PNG con carga LSB conocida',
    'original.bmp': 'Original BMP sin carga conocida',
    'lsb-payload.bmp': 'BMP con carga LSB conocida',
    'noise-control.png': 'Ruido sin carga — falso positivo conocido',
    'small.png': 'Imagen pequeña — resultado no concluyente',
    'flat-control.png': 'Imagen uniforme — diversidad insuficiente',
  };
  return {
    info: {
      name: 'STEGO — Análisis esteganográfico y pruebas de seguridad',
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description:
        'Colección completa de STEGO. Configura el directorio de trabajo en ms-stego, ejecuta pnpm postman:files y completa los tokens solo en valores locales del entorno. Incluye T03, T04, T07, T09, T10, T11 y preparación de T12. Los scripts usan nombres de variables en inglés por compatibilidad con el proyecto. Las carpetas 05–07 requieren run_manual_cases=true y preparación real del equipo. Las condiciones manuales se omiten por defecto; no cuentan como pruebas aprobadas. Los ejemplos guardados provienen de evidencias locales con AUTH de pruebas y no son capturas finales. El p-value no es una probabilidad de contenido oculto; el ruido es un falso positivo conocido. Consulta postman/README.md para orden, configuración y pendientes.',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }],
    },
    event: [
      event(
        'prerequest',
        String.raw`
const origin = pm.variables.get('stego_origin');
if (!origin || !/^https?:\/\/[^/]+(?::\d+)?$/.test(origin)) {
  pm.test('Configurar el origen de STEGO sin /api/v1 ni barra final', function () { pm.expect.fail('Completa stego_origin en el entorno seleccionado.'); });
  pm.execution.skipRequest();
}`,
      ),
      event('test', correlationTests),
    ],
    variable: [
      { key: 'stego_origin', value: 'http://127.0.0.1:3002', type: 'string' },
      { key: 'run_manual_cases', value: 'false', type: 'string' },
    ],
    item: [
      folder(
        '00 · Disponibilidad y contrato',
        'No requiere JWT. La salud comprueba la conexión de STEGO a su propia base de datos.',
        [
          request({
            name: 'Consultar la salud de STEGO',
            description: 'Debe responder ok y database=up.',
            method: 'GET',
            path: `${origin}/api/v1/health`,
            token: null,
            tests:
              "pm.test('STEGO y su base de datos están disponibles', function () { pm.expect(pm.response.json()).to.deep.equal({ status: 'ok', service: 'stego', database: 'up' }); });",
          }),
          request({
            name: 'Consultar OpenAPI en JSON',
            description: 'Contrato generado por las rutas y DTO reales.',
            method: 'GET',
            path: `${origin}/docs-json`,
            token: null,
            tests:
              "pm.test('El contrato documenta análisis y resultados', function () { const body = pm.response.json(); pm.expect(body.paths).to.have.property('/api/v1/steganography/analyze'); pm.expect(body.paths).to.have.property('/api/v1/steganography/results/{id}'); });",
          }),
          request({
            name: 'Consultar OpenAPI en YAML',
            description: 'Versión YAML del contrato de ejecución.',
            method: 'GET',
            path: `${origin}/docs-yaml`,
            token: null,
            tests:
              "pm.test('La respuesta contiene un contrato OpenAPI', function () { pm.expect(pm.response.text()).to.include('openapi:'); });",
          }),
        ],
      ),
      authenticationFolder(),
      folder(
        '02 · T09 — Detección LSB y muestras',
        'Compara las siete imágenes analizables con samples/manifest.json usando la configuración LSB de referencia. El PNG y BMP original/carga conservan los mismos píxeles RGB. La política esperada se configura en el entorno.',
        manifest.samples
          .filter((sample) => sample.expected_http_status === 200)
          .map((sample) =>
            request({
              name: `T09 · ${sampleNames[sample.filename]}`,
              description:
                sample.filename === 'noise-control.png'
                  ? 'No se realizó una operación de ocultamiento. El detector lo clasifica como sospechoso: es un falso positivo conocido y debe mostrarse.'
                  : 'Muestra sintética de referencia. Las métricas no establecen precisión sobre imágenes del mundo real.',
              body: imageBody(`samples/${sample.filename}`),
              tests: sampleTests(sample),
            }),
          ),
      ),
      validationFolder(),
      resultsFolder(),
      ...manualFolders(),
      folder(
        '08 · T12 — Correlación y auditoría',
        'La API no expone un endpoint para descargar auditorías. Después de esta petición, usa last_request_id y docs/evidence/audit-review.sql para revisar los registros con el operador de base de datos.',
        [
          request({
            name: 'T12 · Generar una solicitud trazable sin publicar secretos',
            description:
              'Las marcas de consulta y cabecera son datos sintéticos. Revisa externamente que no aparezcan en la auditoría, junto con JWT, nombres originales ni bytes. Este test verifica la correlación HTTP; no afirma haber leído los logs del servidor.',
            path: `${base}/analyze?audit_probe=marca-sintetica-de-consulta`,
            body: image,
            headers: [
              { key: 'X-Audit-Probe', value: 'marca-sintetica-de-cabecera' },
              {
                key: 'X-Request-Id',
                value: '11111111-1111-4111-8111-111111111111',
              },
            ],
            tests: `${analysisTests}
pm.test('El servidor genera su propio identificador de correlación', function () {
  pm.expect(pm.response.headers.get('X-Request-Id')).not.to.equal('11111111-1111-4111-8111-111111111111');
});
pm.environment.set('last_request_id', pm.response.headers.get('X-Request-Id'));
`,
          }),
        ],
      ),
    ],
  };
}
