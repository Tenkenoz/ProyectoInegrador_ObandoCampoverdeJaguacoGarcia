#!/usr/bin/env node
/*
 * Builds the project-wide Postman collection and environment.
 *
 * It merges the two service collections (AUTH and STEGO), adds the AUTH
 * administrative routes that were missing from the original export and adds an
 * end-to-end AUTH -> STEGO folder with real integration flows.
 *
 * Run from the repository root:
 *   node scripts/build-postman.mjs
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  mkdirSync(resolve(root, 'postman'), { recursive: true });
  writeFileSync(resolve(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bearer(variable) {
  return {
    type: 'bearer',
    bearer: [{ key: 'token', value: `{{${variable}}}`, type: 'string' }],
  };
}

function urlObject(raw) {
  const match = raw.match(/^\{\{([^}]+)\}\}(.*)$/);

  if (!match) {
    return { raw };
  }

  return {
    raw,
    host: [`{{${match[1]}}}`],
    path: match[2].split('/').filter(Boolean),
  };
}

function jsonBody(value) {
  return {
    mode: 'raw',
    raw: JSON.stringify(value, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function testEvent(lines) {
  return {
    listen: 'test',
    script: { type: 'text/javascript', exec: lines },
  };
}

function prerequestEvent(lines) {
  return {
    listen: 'prerequest',
    script: { type: 'text/javascript', exec: lines },
  };
}

function requestItem({
  name,
  method,
  url,
  token,
  body,
  formdata,
  tests = [],
  prerequest = [],
  description,
}) {
  const request = {
    method,
    header: [],
    url: urlObject(url),
  };

  if (description) {
    request.description = description;
  }

  if (token) {
    request.auth = bearer(token);
  }

  if (body) {
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = jsonBody(body);
  }

  if (formdata) {
    request.body = { mode: 'formdata', formdata };
  }

  const item = { id: randomUUID(), name, request };

  const events = [];

  if (prerequest.length > 0) {
    events.push(prerequestEvent(prerequest));
  }

  if (tests.length > 0) {
    events.push(testEvent(tests));
  }

  if (events.length > 0) {
    item.event = events;
  }

  return item;
}

function example(name, code, status, body, originalRequest, requestId) {
  return {
    id: randomUUID(),
    name,
    originalRequest: clone(originalRequest),
    status,
    code,
    _postman_previewlanguage: 'json',
    header: requestId
      ? [{ key: 'X-Request-Id', value: requestId }]
      : [],
    cookie: [],
    responseTime: null,
    body: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
  };
}

/* -------------------------------------------------------------------------- */
/* 1. Base collections                                                        */
/* -------------------------------------------------------------------------- */

const authSource = readJson('ms-users-nestjs/postman/AUTH.postman_collection.json');
const stegoSource = readJson('ms-stego/postman/stego.postman_collection.json');

const stegoFolderEvents = clone(stegoSource.event ?? []);

const authFolders = clone(authSource.item).map((folder) => ({
  ...folder,
  name: `AUTH · ${folder.name}`,
}));

const stegoFolders = clone(stegoSource.item).map((folder) => {
  for (const item of folder.item) {
    const formdata = item.request?.body?.formdata ?? [];

    for (const field of formdata) {
      if (field.type !== 'file' || typeof field.src !== 'string') {
        continue;
      }

      if (field.src.startsWith('samples/')) {
        field.src = `ms-stego/${field.src}`;
      }

      if (field.src.startsWith('postman/files/')) {
        field.src = `ms-stego/${field.src}`;
      }
    }
  }

  return {
    ...folder,
    name: `STEGO · ${folder.name}`,
    event: clone(stegoFolderEvents),
  };
});

/* -------------------------------------------------------------------------- */
/* 2. AUTH administrative routes missing from the original export             */
/* -------------------------------------------------------------------------- */

const adminFolder = {
  name: 'AUTH · 10 - Rutas administrativas completas',
  description:
    'Recorre las rutas de usuarios, roles y asignaciones que no estaban en la exportación original. Crea un usuario desechable para no alterar los usuarios del seed y lo elimina al final.',
  item: [
    requestItem({
      name: 'Resolver roles del sistema',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/roles?page=1&limit=20',
      token: 'adminToken',
      tests: [
        "pm.test('roles are listed', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { const data = pm.response.json().data; for (const name of ['ADMIN', 'ANALYST', 'USER']) { const role = data.find((item) => item.rol === name); if (role) pm.collectionVariables.set('role' + name + 'Id', role.id); } }",
      ],
    }),
    requestItem({
      name: 'Crear usuario desechable',
      method: 'POST',
      url: '{{baseUrl}}/api/v1/users',
      token: 'adminToken',
      body: {
        cedula: '{{crudCedula}}',
        nombres: 'Crud',
        apellidos: 'Temporal',
        fechaNacimiento: '1995-06-06',
        username: '{{crudUsername}}',
        email: '{{crudEmail}}',
        telefono: '{{crudTelefono}}',
        password: '{{userPassword}}',
      },
      prerequest: [
        "const suffix = Date.now().toString().slice(-8);",
        "pm.collectionVariables.set('crudCedula', '17' + suffix.slice(0, 8));",
        "pm.collectionVariables.set('crudTelefono', '09' + suffix.slice(0, 8));",
        "pm.collectionVariables.set('crudUsername', 'crud.' + suffix);",
        "pm.collectionVariables.set('crudEmail', 'crud.' + suffix + '@demo.local');",
      ],
      tests: [
        "pm.test('user is created', function () { pm.response.to.have.status(201); });",
        "if (pm.response.code === 201) { const body = pm.response.json(); pm.collectionVariables.set('crudUserId', body.id); pm.collectionVariables.set('targetUserId', body.id); }",
      ],
    }),
    requestItem({
      name: 'GET /users/cedula/:cedula',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/users/cedula/{{crudCedula}}',
      token: 'adminToken',
      tests: [
        "pm.test('user is found by cedula', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.collectionVariables.set('targetUserId', pm.response.json().id); }",
      ],
    }),
    requestItem({
      name: 'GET /users/:id',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/users/{{targetUserId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('targetUserId')) { pm.test('Ejecuta primero la creación del usuario desechable', function () { pm.expect.fail('Falta targetUserId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('user is found by id', function () { pm.response.to.have.status(200); });",
        "pm.test('the identifier matches', function () { pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get('targetUserId')); });",
      ],
    }),
    requestItem({
      name: 'PATCH /users/:id',
      method: 'PATCH',
      url: '{{baseUrl}}/api/v1/users/{{targetUserId}}',
      token: 'adminToken',
      body: { nombres: 'Crud Editado' },
      prerequest: [
        "if (!pm.collectionVariables.get('targetUserId')) { pm.test('Ejecuta primero la creación del usuario desechable', function () { pm.expect.fail('Falta targetUserId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('user is updated', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.expect(pm.response.json().nombres).to.eql('Crud Editado'); }",
      ],
    }),
    requestItem({
      name: 'GET /roles/:id',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/roles/{{roleUserId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('roleUserId')) { pm.test('Ejecuta primero la resolución de roles', function () { pm.expect.fail('Falta roleUserId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('role is found', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.expect(pm.response.json().rol).to.eql('USER'); }",
      ],
    }),
    requestItem({
      name: 'PATCH /roles/:id',
      method: 'PATCH',
      url: '{{baseUrl}}/api/v1/roles/{{roleUserId}}',
      token: 'adminToken',
      body: { estado: true },
      prerequest: [
        "if (!pm.collectionVariables.get('roleUserId')) { pm.test('Ejecuta primero la resolución de roles', function () { pm.expect.fail('Falta roleUserId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('role is updated', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.expect(pm.response.json().estado).to.eql(true); }",
      ],
    }),
    requestItem({
      name: 'Asignar rol USER al usuario desechable',
      method: 'POST',
      url: '{{baseUrl}}/api/v1/user-roles',
      token: 'adminToken',
      body: { userId: '{{targetUserId}}', roleId: '{{roleUserId}}' },
      prerequest: [
        "if (!pm.collectionVariables.get('targetUserId') || !pm.collectionVariables.get('roleUserId')) { pm.test('Faltan identificadores de preparación', function () { pm.expect.fail('Ejecuta primero la creación del usuario y la resolución de roles.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('assignment is created', function () { pm.response.to.have.status(201); });",
        "if (pm.response.code === 201) { pm.collectionVariables.set('crudAssignmentId', pm.response.json().id); }",
      ],
    }),
    requestItem({
      name: 'PATCH /user-roles/:id',
      method: 'PATCH',
      url: '{{baseUrl}}/api/v1/user-roles/{{crudAssignmentId}}',
      token: 'adminToken',
      body: { estado: true },
      prerequest: [
        "if (!pm.collectionVariables.get('crudAssignmentId')) { pm.test('Ejecuta primero la asignación del rol', function () { pm.expect.fail('Falta crudAssignmentId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('assignment is updated', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.expect(pm.response.json().estado).to.eql(true); }",
      ],
    }),
    requestItem({
      name: 'DELETE /user-roles/:id',
      method: 'DELETE',
      url: '{{baseUrl}}/api/v1/user-roles/{{crudAssignmentId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('crudAssignmentId')) { pm.test('Ejecuta primero la asignación del rol', function () { pm.expect.fail('Falta crudAssignmentId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('assignment is removed', function () { pm.response.to.have.status(204); });"],
    }),
    requestItem({
      name: 'Reasignar rol USER para probar la ruta por usuario y rol',
      method: 'POST',
      url: '{{baseUrl}}/api/v1/user-roles',
      token: 'adminToken',
      body: { userId: '{{targetUserId}}', roleId: '{{roleUserId}}' },
      prerequest: [
        "if (!pm.collectionVariables.get('targetUserId') || !pm.collectionVariables.get('roleUserId')) { pm.test('Faltan identificadores de preparación', function () { pm.expect.fail('Ejecuta primero la creación del usuario y la resolución de roles.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('assignment is recreated', function () { pm.response.to.have.status(201); });"],
    }),
    requestItem({
      name: 'DELETE /user-roles/:userId/:roleId',
      method: 'DELETE',
      url: '{{baseUrl}}/api/v1/user-roles/{{targetUserId}}/{{roleUserId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('targetUserId') || !pm.collectionVariables.get('roleUserId')) { pm.test('Faltan identificadores de preparación', function () { pm.expect.fail('Ejecuta primero la creación del usuario y la resolución de roles.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('assignment is removed by user and role', function () { pm.response.to.have.status(204); });"],
    }),
    requestItem({
      name: 'GET /auth/me',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/auth/me',
      token: 'adminToken',
      tests: [
        "pm.test('current identity is returned', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.expect(pm.response.json().id).to.eql(pm.collectionVariables.get('adminUserId')); }",
      ],
    }),
    requestItem({
      name: 'DELETE /users/:id',
      method: 'DELETE',
      url: '{{baseUrl}}/api/v1/users/{{targetUserId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('targetUserId')) { pm.test('Ejecuta primero la creación del usuario desechable', function () { pm.expect.fail('Falta targetUserId.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('disposable user is removed', function () { pm.response.to.have.status(204); });",
        "pm.collectionVariables.unset('targetUserId');",
        "pm.collectionVariables.unset('crudUserId');",
        "pm.collectionVariables.unset('crudAssignmentId');",
      ],
    }),
  ],
};

const authCleanupFolder = {
  name: 'AUTH · 99 - Limpieza de usuarios desechables',
  description:
    'Elimina los usuarios creados por las carpetas de preparación y de T05–T07 para dejar la base con los usuarios del seed. Si una carpeta anterior se omitió, las solicitudes también se omiten.',
  item: [
    requestItem({
      name: 'DELETE user A',
      method: 'DELETE',
      url: '{{baseUrl}}/api/v1/users/{{userAId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('userAId')) { console.log('[skip] No hay userAId que eliminar.'); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('disposable user A is removed', function () { pm.response.to.have.status(204); });",
        "pm.collectionVariables.unset('userAId');",
      ],
    }),
    requestItem({
      name: 'DELETE user B',
      method: 'DELETE',
      url: '{{baseUrl}}/api/v1/users/{{userBId}}',
      token: 'adminToken',
      prerequest: [
        "if (!pm.collectionVariables.get('userBId')) { console.log('[skip] No hay userBId que eliminar.'); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('disposable user B is removed', function () { pm.response.to.have.status(204); });",
        "pm.collectionVariables.unset('userBId');",
      ],
    }),
  ],
};

/* -------------------------------------------------------------------------- */
/* 3. End-to-end integration flow                                             */
/* -------------------------------------------------------------------------- */

const analystLogin = requestItem({
  name: 'Login ANALYST (analyst.one)',
  method: 'POST',
  url: '{{baseUrl}}/api/v1/auth/login',
  body: { identifier: 'analyst.one', password: '{{analystonePassword}}' },
  tests: [
    "pm.test('login succeeds', function () { pm.response.to.have.status(200); });",
    "if (pm.response.code === 200) { const body = pm.response.json(); pm.environment.set('access_token', body.accessToken); pm.environment.set('revocation_token', body.accessToken); pm.collectionVariables.set('analysis_owner_id', body.user.id); }",
  ],
});

analystLogin.response = [
  example(
    'Login correcto — HTTP 200',
    200,
    'OK',
    {
      accessToken: '<JWT omitido en el ejemplo>',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: '7372184b-bfe4-453a-a8d5-d6a3e6e86a96',
        username: 'analyst.one',
        email: 'analyst.one@demo.local',
        roles: ['ANALYST'],
      },
    },
    analystLogin.request,
    '6f0b1a0b-8e34-4f52-9a66-6d6b4bb8f1a2',
  ),
];

const analyzeRequest = requestItem({
  name: 'T09 · Analizar una muestra LSB',
  method: 'POST',
  url: '{{stego_origin}}/api/v1/steganography/analyze',
  token: 'access_token',
  formdata: [
    {
      key: 'file',
      type: 'file',
      contentType: 'image/png',
      src: 'ms-stego/samples/lsb-payload.png',
    },
  ],
  prerequest: [
    "if (!pm.variables.get('access_token')) { pm.test('Ejecuta primero el login ANALYST', function () { pm.expect.fail('Falta access_token.'); }); pm.execution.skipRequest(); }",
  ],
  tests: [
    "pm.test('analysis succeeds', function () { pm.response.to.have.status(200); });",
    "if (pm.response.code === 200) { const body = pm.response.json(); pm.environment.set('analysis_id', body.analysis_id); pm.test('the owner is the authenticated analyst', function () { pm.expect(body.user_id).to.eql(pm.collectionVariables.get('analysis_owner_id')); }); }",
  ],
});

analyzeRequest.response = [
  example(
    'Análisis LSB — HTTP 200',
    200,
    'OK',
    {
      analysis_id: '7f95f293-053f-4321-96bd-ba25628cd3dd',
      upload_id: '7f95f293-053f-4321-96bd-ba25628cd3dd',
      user_id: '7372184b-bfe4-453a-a8d5-d6a3e6e86a96',
      filename: '7f95f293-053f-4321-96bd-ba25628cd3dd.png',
      original_filename: 'lsb-payload.png',
      sha256: '8e0f1ce6db9a9ab5b28c7c435e24af6a4fa9b6a156747a369743baf075c69117',
      format: 'png',
      size_bytes: 56324,
      width: 128,
      height: 128,
      status: 'sospechoso',
      technique: 'lsb_chi_square_v1',
      reason: 'pair_balance_compatible',
      policy: { version: 'stego_policy_v1', action: 'cuarentena' },
      action: 'cuarentena',
      quarantine: { state: 'stored', expires_at: null, deleted_at: null },
    },
    analyzeRequest.request,
    'd1477aae-691b-4dba-9ae0-08788efcc21e',
  ),
];

function simpleLogin(name, identifier, tokenVariable, extraLines = []) {
  const item = requestItem({
    name,
    method: 'POST',
    url: '{{baseUrl}}/api/v1/auth/login',
    body: { identifier, password: `{{${identifier.replaceAll('.', '')}Password}}` },
    tests: [
      "pm.test('login succeeds', function () { pm.response.to.have.status(200); });",
      `if (pm.response.code === 200) { pm.environment.set('${tokenVariable}', pm.response.json().accessToken); }`,
      ...extraLines,
    ],
  });

  return item;
}

const integrationFolder = {
  name: '11 - Integración AUTH–STEGO',
  description:
    'Flujo real entre los dos servicios: login en AUTH, análisis en STEGO, propiedad de resultados, acumulación de roles, revocación con el mismo JWT, logout y fallo seguro cuando AUTH no está disponible.',
  item: [
    analystLogin,
    analyzeRequest,
    requestItem({
      name: 'Consultar el resultado propio',
      method: 'GET',
      url: '{{stego_origin}}/api/v1/steganography/results/{{analysis_id}}',
      token: 'access_token',
      prerequest: [
        "if (!pm.variables.get('analysis_id')) { pm.test('Ejecuta primero el análisis', function () { pm.expect.fail('Falta analysis_id.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('owner can read the result', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { pm.expect(pm.response.json().user_id).to.eql(pm.collectionVariables.get('analysis_owner_id')); }",
      ],
    }),
    simpleLogin('Login segundo ANALYST (analyst.two)', 'analyst.two', 'second_analyst_token'),
    requestItem({
      name: 'T11 · Otro ANALYST no puede leer el resultado',
      method: 'GET',
      url: '{{stego_origin}}/api/v1/steganography/results/{{analysis_id}}',
      token: 'second_analyst_token',
      prerequest: [
        "if (!pm.variables.get('analysis_id') || !pm.variables.get('second_analyst_token')) { pm.test('Ejecuta primero el análisis y el segundo login', function () { pm.expect.fail('Faltan variables de la prueba.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('ownership check denies the other analyst', function () { pm.response.to.have.status(403); });"],
    }),
    simpleLogin('Login ADMIN', 'admin', 'admin_token', [
      "if (pm.response.code === 200) { pm.collectionVariables.set('adminUserId', pm.response.json().user.id); }",
    ]),
    requestItem({
      name: 'T11 · ADMIN puede leer cualquier resultado',
      method: 'GET',
      url: '{{stego_origin}}/api/v1/steganography/results/{{analysis_id}}',
      token: 'admin_token',
      prerequest: [
        "if (!pm.variables.get('analysis_id') || !pm.variables.get('admin_token')) { pm.test('Ejecuta primero el análisis y el login ADMIN', function () { pm.expect.fail('Faltan variables de la prueba.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('ADMIN reads with any scope', function () { pm.response.to.have.status(200); });"],
    }),
    simpleLogin('Login USER', 'user.standard', 'user_token'),
    requestItem({
      name: 'T04 · USER no puede analizar',
      method: 'POST',
      url: '{{stego_origin}}/api/v1/steganography/analyze',
      token: 'user_token',
      formdata: [
        {
          key: 'file',
          type: 'file',
          contentType: 'image/png',
          src: 'ms-stego/samples/lsb-payload.png',
        },
      ],
      prerequest: [
        "if (!pm.variables.get('user_token')) { pm.test('Ejecuta primero el login USER', function () { pm.expect.fail('Falta user_token.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('USER is denied before reading the upload', function () { pm.response.to.have.status(403); });"],
    }),
    requestItem({
      name: 'T08 · AUTH no disponible devuelve 503 sin crear análisis',
      method: 'POST',
      url: '{{stego_origin}}/api/v1/steganography/analyze',
      token: 'access_token',
      formdata: [
        {
          key: 'file',
          type: 'file',
          contentType: 'image/png',
          src: 'ms-stego/samples/lsb-payload.png',
        },
      ],
      prerequest: [
        "if (pm.variables.get('auth_unavailable_confirmed') !== 'true') { console.log('[skip] Detén auth y auth-api y marca auth_unavailable_confirmed=true para ejecutar T08.'); pm.execution.skipRequest(); }",
        "if (!pm.variables.get('access_token')) { pm.test('Ejecuta primero el login ANALYST', function () { pm.expect.fail('Falta access_token.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('STEGO fails safe when AUTH is unavailable', function () { pm.response.to.have.status(503); });"],
    }),
    requestItem({
      name: 'T07 · Resolver el rol ANALYST',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/roles?page=1&limit=20',
      token: 'admin_token',
      tests: [
        "pm.test('roles are listed', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { const role = pm.response.json().data.find((item) => item.rol === 'ANALYST'); if (role) pm.collectionVariables.set('roleAnalystId', role.id); }",
      ],
    }),
    requestItem({
      name: 'T07 · Obtener la asignación ANALYST del propietario',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/user-roles/user/{{analysis_owner_id}}',
      token: 'admin_token',
      prerequest: [
        "if (!pm.collectionVariables.get('analysis_owner_id')) { pm.test('Ejecuta primero el login ANALYST', function () { pm.expect.fail('Falta analysis_owner_id.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('assignments are listed', function () { pm.response.to.have.status(200); });",
        "if (pm.response.code === 200) { const assignment = pm.response.json().find((item) => item.role && item.role.rol === 'ANALYST'); pm.expect(assignment, 'ANALYST assignment').to.be.an('object'); if (assignment) pm.collectionVariables.set('revocation_assignment_id', assignment.id); }",
      ],
    }),
    requestItem({
      name: 'T07 · Retirar el rol ANALYST',
      method: 'DELETE',
      url: '{{baseUrl}}/api/v1/user-roles/{{revocation_assignment_id}}',
      token: 'admin_token',
      prerequest: [
        "if (!pm.collectionVariables.get('revocation_assignment_id')) { pm.test('Ejecuta primero la consulta de asignaciones', function () { pm.expect.fail('Falta revocation_assignment_id.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('role assignment is removed', function () { pm.response.to.have.status(204); });"],
    }),
    requestItem({
      name: 'T07 · El mismo JWT recibe 403 tras la revocación',
      method: 'POST',
      url: '{{stego_origin}}/api/v1/steganography/analyze',
      token: 'revocation_token',
      formdata: [
        {
          key: 'file',
          type: 'file',
          contentType: 'image/png',
          src: 'ms-stego/samples/lsb-payload.png',
        },
      ],
      prerequest: [
        "if (!pm.variables.get('revocation_token')) { pm.test('Ejecuta primero el login ANALYST', function () { pm.expect.fail('Falta revocation_token.'); }); pm.execution.skipRequest(); }",
      ],
      tests: [
        "pm.test('the unchanged token is now denied', function () { pm.response.to.have.status(403); });",
        "pm.test('the token was not replaced', function () { pm.expect(pm.variables.get('revocation_token')).to.be.a('string').and.not.empty; });",
      ],
    }),
    requestItem({
      name: 'T07 · Restaurar el rol ANALYST',
      method: 'POST',
      url: '{{baseUrl}}/api/v1/user-roles',
      token: 'admin_token',
      body: { userId: '{{analysis_owner_id}}', roleId: '{{roleAnalystId}}' },
      prerequest: [
        "if (!pm.collectionVariables.get('analysis_owner_id') || !pm.collectionVariables.get('roleAnalystId')) { pm.test('Faltan identificadores de la prueba', function () { pm.expect.fail('Ejecuta primero la resolución del rol.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('role is restored', function () { pm.response.to.have.status(201); });"],
    }),
    requestItem({
      name: 'Logout del ANALYST',
      method: 'POST',
      url: '{{baseUrl}}/api/v1/auth/logout',
      token: 'access_token',
      prerequest: [
        "if (!pm.variables.get('access_token')) { pm.test('Ejecuta primero el login ANALYST', function () { pm.expect.fail('Falta access_token.'); }); pm.execution.skipRequest(); }",
      ],
      tests: ["pm.test('logout succeeds', function () { pm.response.to.have.status(204); });"],
    }),
    requestItem({
      name: 'Reutilizar el JWT después del logout',
      method: 'GET',
      url: '{{baseUrl}}/api/v1/auth/profile',
      token: 'access_token',
      tests: ["pm.test('the revoked session is rejected', function () { pm.response.to.have.status(401); });"],
    }),
  ],
};

/* -------------------------------------------------------------------------- */
/* 4. Assemble the collection                                                 */
/* -------------------------------------------------------------------------- */

const collection = {
  info: {
    _postman_id: randomUUID(),
    name: 'PROYECTO — Integración AUTH–STEGO',
    description:
      'Colección completa del Proyecto Integrador. Incluye todas las rutas de AUTH y STEGO, los casos T01–T12 y flujos integrados con tokens reales. Los ejemplos de STEGO son locales y están etiquetados como tales; las capturas finales se generan al ejecutar contra el Compose.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'https://localhost:3001' },
    { key: 'stego_origin', value: 'https://localhost:8443' },
    ...(authSource.variable ?? []),
    { key: 'access_token', value: '' },
    { key: 'second_analyst_token', value: '' },
    { key: 'admin_token', value: '' },
    { key: 'user_token', value: '' },
    { key: 'revocation_token', value: '' },
    { key: 'analysis_owner_id', value: '' },
    { key: 'revocation_assignment_id', value: '' },
    { key: 'roleAnalystId', value: '' },
    { key: 'targetUserId', value: '' },
    { key: 'crudCedula', value: '' },
    { key: 'crudTelefono', value: '' },
    { key: 'crudUsername', value: '' },
    { key: 'crudEmail', value: '' },
    { key: 'crudUserId', value: '' },
    { key: 'crudAssignmentId', value: '' },
  ],
  item: [...authFolders, adminFolder, authCleanupFolder, ...stegoFolders, integrationFolder],
};

/* -------------------------------------------------------------------------- */
/* 5. Environment                                                             */
/* -------------------------------------------------------------------------- */

const environment = {
  id: randomUUID(),
  name: 'PROYECTO — Integración local',
  values: [
    {
      key: 'baseUrl',
      value: 'https://localhost:3001',
      type: 'default',
      enabled: true,
    },
    {
      key: 'stego_origin',
      value: 'https://localhost:8443',
      type: 'default',
      enabled: true,
    },
    {
      key: 'adminIdentifier',
      value: 'admin',
      type: 'default',
      enabled: true,
    },
    {
      key: 'adminPassword',
      value: 'DemoSeguro2026!',
      type: 'secret',
      enabled: true,
    },
    {
      key: 'userPassword',
      value: 'DemoSeguro2026!',
      type: 'secret',
      enabled: true,
    },
    {
      key: 'analystonePassword',
      value: 'DemoSeguro2026!',
      type: 'secret',
      enabled: true,
    },
    {
      key: 'analysttwoPassword',
      value: 'DemoSeguro2026!',
      type: 'secret',
      enabled: true,
    },
    {
      key: 'userstandardPassword',
      value: 'DemoSeguro2026!',
      type: 'secret',
      enabled: true,
    },
    {
      key: 'authServiceSecret',
      value: 'replace-with-64-hex-secret',
      type: 'secret',
      enabled: true,
    },
    ...(stegoSource.variable ?? [])
      .filter(
        (variable) =>
          !['stego_origin', 'run_manual_cases'].includes(variable.key),
      )
      .map((variable) => ({
        key: variable.key,
        value: variable.value ?? '',
        type: 'default',
        enabled: true,
      })),
    { key: 'analysis_id', value: '', type: 'default', enabled: true },
    { key: 'retained_analysis_id', value: '', type: 'default', enabled: true },
    {
      key: 'missing_analysis_id',
      value: '00000000-0000-4000-8000-000000000001',
      type: 'default',
      enabled: true,
    },
    {
      key: 'expected_suspicious_action',
      value: 'cuarentena',
      type: 'default',
      enabled: true,
    },
    {
      key: 'expected_inconclusive_action',
      value: 'advertencia',
      type: 'default',
      enabled: true,
    },
    {
      key: 'upload_max_file_bytes',
      value: '5242880',
      type: 'default',
      enabled: true,
    },
    {
      key: 'oversized_file_bytes',
      value: '5242881',
      type: 'default',
      enabled: true,
    },
    { key: 'run_manual_cases', value: 'false', type: 'default', enabled: true },
    {
      key: 'role_revoked_confirmed',
      value: 'false',
      type: 'default',
      enabled: true,
    },
    {
      key: 'auth_unavailable_confirmed',
      value: 'false',
      type: 'default',
      enabled: true,
    },
    {
      key: 'retention_cleanup_confirmed',
      value: 'false',
      type: 'default',
      enabled: true,
    },
    {
      key: 'revocation_fingerprint',
      value: '',
      type: 'default',
      enabled: true,
    },
    { key: 'last_request_id', value: '', type: 'default', enabled: true },
    { key: 'access_token', value: '', type: 'secret', enabled: true },
    { key: 'expired_token', value: '', type: 'secret', enabled: true },
    { key: 'second_analyst_token', value: '', type: 'secret', enabled: true },
    { key: 'admin_token', value: '', type: 'secret', enabled: true },
    { key: 'user_token', value: '', type: 'secret', enabled: true },
    { key: 'revocation_token', value: '', type: 'secret', enabled: true },
  ],
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date().toISOString(),
  _postman_exported_using: 'scripts/build-postman.mjs',
};

writeJson('postman/PROYECTO.postman_collection.json', collection);
writeJson('postman/PROYECTO.postman_environment.json', environment);

const requestCount = (items) =>
  items.reduce(
    (total, item) =>
      total + (item.item ? requestCount(item.item) : 1),
    0,
  );

console.log(
  `[postman] collection: ${requestCount(collection.item)} requests in ${collection.item.length} folders`,
);
console.log('[postman] wrote postman/PROYECTO.postman_collection.json');
console.log('[postman] wrote postman/PROYECTO.postman_environment.json');
