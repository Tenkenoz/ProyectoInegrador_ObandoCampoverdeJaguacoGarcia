#!/usr/bin/env node
/*
 * Generates the final integration evidence for T01–T12.
 *
 * The script talks to the running Compose stack with real AUTH tokens and real
 * STEGO analyses. It writes sanitized Markdown and JSON captures under
 * docs/evidencias/ (ignored by Git, delivered with the evidence package).
 *
 * Run from the repository root:
 *   NODE_EXTRA_CA_CERTS=docker/certs/auth-ca.pem node scripts/capture-evidence.mjs
 *
 * Requirements: the stack is healthy, the demo seed was executed and
 * ms-stego/postman/files was prepared. The script stops AUTH during T08 and
 * restores it before finishing.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(root, 'docs/evidencias');
const caPath = resolve(root, 'docker/certs/auth-ca.pem');
const AUTH = 'https://localhost:3001';
const STEGO = 'https://localhost:8443';
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'DemoSeguro2026!';

if (!process.env.NODE_EXTRA_CA_CERTS) {
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(import.meta.url)],
    {
      cwd: root,
      env: { ...process.env, NODE_EXTRA_CA_CERTS: caPath },
      stdio: 'inherit',
    },
  );
  process.exit(typeof result === 'number' ? result : 0);
}

const dotenv = Object.fromEntries(
  readFileSync(resolve(root, '.env'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const STEGO_DB_USER = dotenv.STEGO_DB_USER ?? 'stego_app';
const STEGO_DB_NAME = dotenv.STEGO_DB_NAME ?? 'stego_db';

const command = (file, args, options = {}) =>
  execFileSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();

const shell = (script) => command('bash', ['-c', script]);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function jwtPart(token, index) {
  return JSON.parse(Buffer.from(token.split('.')[index], 'base64url').toString());
}

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (
          /^(accessToken|access_token|subject_token|authorization|password)$/i.test(
            key,
          )
        ) {
          return [key, '<redacted>'];
        }

        return [key, redact(item)];
      }),
    );
  }

  if (typeof value === 'string') {
    return value
      .replace(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
        '<JWT>',
      )
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <JWT>');
  }

  return value;
}

async function request(method, url, options = {}) {
  const headers = {};
  let body;

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  if (options.form) {
    body = options.form;
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const text = await response.text();
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return {
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    contentType: response.headers.get('content-type'),
    body: parsed,
  };
}

function fileForm(field, relativePath, type) {
  const absolutePath = resolve(root, relativePath);
  const form = new FormData();
  form.append(
    field,
    new Blob([readFileSync(absolutePath)], { type }),
    basename(absolutePath),
  );
  return form;
}

async function login(identifier) {
  const result = await request('POST', `${AUTH}/api/v1/auth/login`, {
    json: { identifier, password: PASSWORD },
  });

  if (result.status !== 200) {
    throw new Error(
      `Login failed for ${identifier}: HTTP ${result.status} ${JSON.stringify(result.body)}`,
    );
  }

  const token = result.body.accessToken;
  if (!token || token === '<redacted>') {
    throw new Error(`Login response for ${identifier} did not include a token`);
  }

  return {
    token,
    userId: result.body.user.id,
    username: result.body.user.username,
    roles: result.body.user.roles,
  };
}

function dbCount(table, where = '') {
  return Number(
    command('docker', [
      'compose',
      'exec',
      '-T',
      'stego-db',
      'psql',
      '-U',
      STEGO_DB_USER,
      '-d',
      STEGO_DB_NAME,
      '-tAc',
      `select count(*) from ${table}${where}`,
    ]),
  );
}

function dbJson(sql) {
  const output = command('docker', [
    'compose',
    'exec',
    '-T',
    'stego-db',
    'psql',
    '-U',
    STEGO_DB_USER,
    '-d',
    STEGO_DB_NAME,
    '-tAc',
    `select coalesce(json_agg(row_to_json(t)), '[]'::json) from (${sql}) t`,
  ]);

  return JSON.parse(output);
}

const captures = new Map();

function bucket(id, title) {
  if (!captures.has(id)) {
    captures.set(id, { id, title, cases: [] });
  }

  return captures.get(id);
}

function addCase(id, title, testCase) {
  bucket(id, title).cases.push({
    at: new Date().toISOString(),
    ...testCase,
  });
}

async function httpCase(
  id,
  title,
  name,
  description,
  method,
  url,
  options = {},
  extra = {},
) {
  const result = await request(method, url, options);

  addCase(id, title, {
    kind: 'http',
    name,
    description,
    request: {
      method,
      url: url.replace(AUTH, '<AUTH>').replace(STEGO, '<STEGO>'),
      authenticated: Boolean(options.token),
      ...(options.json ? { body: redact(options.json) } : {}),
      ...(options.form ? { body: '<multipart/form-data>' } : {}),
    },
    status: result.status,
    requestId: result.requestId,
    response: redact(result.body),
    ...extra,
  });

  return result;
}

function commandCase(id, title, name, script, output, extra = {}) {
  addCase(id, title, {
    kind: 'command',
    name,
    command: script,
    output: redact(output),
    ...extra,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Evidence assertion failed: ${message}`);
  }
}

async function waitFor(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting while the container starts.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

const startedAt = new Date().toISOString();
const commit = command('git', ['rev-parse', 'HEAD']);
const commitSubject = command('git', ['log', '-1', '--pretty=%s']);
const environment = {
  startedAt,
  commit,
  commitSubject,
  node: process.version,
  docker: command('docker', ['--version']),
  compose: command('docker', ['compose', 'version', '--short']),
  openssl: command('openssl', ['version']),
};

console.log(`[evidence] commit ${commit.slice(0, 12)} — ${commitSubject}`);

/* -------------------------------------------------------------------------- */
/* T01 — deployment, health, TLS and JWKS                                     */
/* -------------------------------------------------------------------------- */

{
  const id = 'T01';
  const title = 'Despliegue, salud, TLS y JWKS';

  const ps = shell('docker compose ps');
  commandCase(id, title, 'Servicios del despliegue', 'docker compose ps', ps);

  const services = shell('docker compose config --services');
  commandCase(
    id,
    title,
    'Servicios declarados',
    'docker compose config --services',
    services,
  );

  const networks = shell(
    'docker compose config --networks --format json 2>/dev/null || docker network ls --filter name=secure-chat',
  );
  commandCase(
    id,
    title,
    'Redes de Compose',
    'docker compose config --networks',
    networks,
  );

  const health = await httpCase(
    id,
    title,
    'Salud de AUTH por HTTPS',
    'AUTH responde en el puerto 3001 con TLS terminado en nginx.',
    'GET',
    `${AUTH}/api/v1/health`,
  );
  assert(health.status === 200, 'AUTH health must return 200');

  const jwks = await httpCase(
    id,
    title,
    'JWKS público de AUTH',
    'Solo material público; cada clave incluye kid y algoritmo RS256.',
    'GET',
    `${AUTH}/.well-known/jwks.json`,
  );
  assert(jwks.status === 200, 'JWKS must return 200');
  assert(Array.isArray(jwks.body.keys), 'JWKS must contain keys');
  assert(
    jwks.body.keys.every((key) => key.alg === 'RS256' && key.kid),
    'JWKS keys must be RS256 with kid',
  );

  const stegoHealth = await httpCase(
    id,
    title,
    'Salud de STEGO por el borde HTTPS',
    'El cliente entra por https://localhost:8443; STEGO sigue en HTTP interno.',
    'GET',
    `${STEGO}/api/v1/health`,
  );
  assert(stegoHealth.status === 200, 'STEGO health must return 200');

  const verify = shell(
    'openssl verify -CAfile docker/certs/auth-ca.pem docker/certs/auth.crt docker/certs/edge.crt',
  );
  commandCase(
    id,
    title,
    'Verificación de la cadena local',
    'openssl verify -CAfile docker/certs/auth-ca.pem docker/certs/auth.crt docker/certs/edge.crt',
    verify,
  );

  const san = shell(
    'openssl x509 -in docker/certs/auth.crt -noout -subject -ext subjectAltName',
  );
  commandCase(
    id,
    title,
    'SAN del certificado de AUTH',
    'openssl x509 -in docker/certs/auth.crt -noout -subject -ext subjectAltName',
    san,
  );
  assert(san.includes('DNS:auth'), 'AUTH certificate must include DNS:auth');

  const tls = shell(
    `echo | openssl s_client -connect localhost:3001 -servername localhost -CAfile docker/certs/auth-ca.pem 2>/dev/null | openssl x509 -noout -issuer -subject`,
  );
  commandCase(
    id,
    title,
    'Negociación TLS real contra AUTH',
    'openssl s_client -connect localhost:3001 -servername localhost',
    tls,
  );
}

/* -------------------------------------------------------------------------- */
/* T02 — authentication                                                       */
/* -------------------------------------------------------------------------- */

const admin = await login('admin');

{
  const id = 'T02';
  const title = 'Autenticación y claims del JWT';

  const valid = await httpCase(
    id,
    title,
    'Login con contraseña válida',
    'El cuerpo incluye accessToken, tokenType Bearer, expiresIn 900 y roles vigentes.',
    'POST',
    `${AUTH}/api/v1/auth/login`,
    { json: { identifier: 'admin', password: PASSWORD } },
  );
  assert(valid.status === 200, 'valid login must return 200');

  const invalid = await httpCase(
    id,
    title,
    'Login con contraseña inválida',
    'Credenciales incorrectas no revelan si el usuario existe.',
    'POST',
    `${AUTH}/api/v1/auth/login`,
    { json: { identifier: 'admin', password: 'WrongPassword2026!' } },
  );
  assert(invalid.status === 401, 'invalid password must return 401');

  const unknown = await httpCase(
    id,
    title,
    'Login con usuario desconocido',
    'Misma respuesta 401 que una contraseña incorrecta.',
    'POST',
    `${AUTH}/api/v1/auth/login`,
    { json: { identifier: 'does.not.exist', password: PASSWORD } },
  );
  assert(unknown.status === 401, 'unknown user must return 401');

  const profile = await httpCase(
    id,
    title,
    'Perfil con el JWT emitido',
    'El perfil se obtiene con el token y devuelve los roles actuales.',
    'GET',
    `${AUTH}/api/v1/auth/profile`,
    { token: admin.token },
  );
  assert(profile.status === 200, 'profile must return 200');
  assert(profile.body.id === admin.userId, 'profile id must match the subject');

  addCase(id, title, {
    kind: 'jwt',
    name: 'Claims del JWT emitido',
    description:
      'Cabecera y payload decodificados sin incluir la firma. Se comprueban alg, kid, iss, aud, typ y tokenVersion.',
    header: jwtPart(admin.token, 0),
    payload: jwtPart(admin.token, 1),
  });

  assert(jwtPart(admin.token, 0).alg === 'RS256', 'JWT must use RS256');
  assert(Boolean(jwtPart(admin.token, 0).kid), 'JWT must include kid');
  assert(
    jwtPart(admin.token, 1).iss === 'secure-chat-auth',
    'JWT iss must match the contract',
  );
  assert(
    jwtPart(admin.token, 1).aud === 'secure-chat-api',
    'JWT aud must match the contract',
  );
  assert(jwtPart(admin.token, 1).typ === 'access', 'JWT typ must be access');
}

/* Wait for the login throttle window before requesting the remaining tokens. */
console.log('[evidence] waiting 61 s for the login throttle window');
await sleep(61_000);

const analystOne = await login('analyst.one');
const analystTwo = await login('analyst.two');
const userStandard = await login('user.standard');

/* -------------------------------------------------------------------------- */
/* T03 — forged and invalid JWTs                                              */
/* -------------------------------------------------------------------------- */

{
  const id = 'T03';
  const title = 'Rechazo de JWT ausente, manipulado o inválido';

  const cases = [
    {
      name: 'Solicitud sin JWT',
      description: 'Sin cabecera Authorization.',
      token: null,
    },
    {
      name: 'JWT malformado',
      description: 'Tres segmentos que no son un JWT válido.',
      token: 'not.a.jwt',
    },
    {
      name: 'Firma manipulada',
      description:
        'Se conserva el JWT real y se alteran los últimos caracteres de la firma.',
      token: `${analystOne.token.slice(0, -4)}AAAA`,
    },
    {
      name: 'JWT vencido',
      description: 'Firmado con la clave local, exp en el pasado.',
      token: command('node', [
        'scripts/forge-token.mjs',
        '--sub',
        analystOne.userId,
        '--username',
        'analyst.one',
        '--token-version',
        '1',
        '--expired',
      ]),
    },
    {
      name: 'Emisor incorrecto',
      description: 'iss distinto de secure-chat-auth.',
      token: command('node', [
        'scripts/forge-token.mjs',
        '--sub',
        analystOne.userId,
        '--username',
        'analyst.one',
        '--token-version',
        '1',
        '--issuer',
        'attacker',
      ]),
    },
    {
      name: 'Audiencia incorrecta',
      description: 'aud distinta de secure-chat-api.',
      token: command('node', [
        'scripts/forge-token.mjs',
        '--sub',
        analystOne.userId,
        '--username',
        'analyst.one',
        '--token-version',
        '1',
        '--audience',
        'other-api',
      ]),
    },
    {
      name: 'Tipo incorrecto',
      description: 'typ refresh en lugar de access.',
      token: command('node', [
        'scripts/forge-token.mjs',
        '--sub',
        analystOne.userId,
        '--username',
        'analyst.one',
        '--token-version',
        '1',
        '--typ',
        'refresh',
      ]),
    },
    {
      name: 'kid desconocido',
      description: 'Cabecera con un kid que no existe en JWKS.',
      token: command('node', [
        'scripts/forge-token.mjs',
        '--sub',
        analystOne.userId,
        '--username',
        'analyst.one',
        '--token-version',
        '1',
        '--kid',
        'unknown-key',
      ]),
    },
    {
      name: 'Algoritmo none',
      description: 'Token sin firma con alg none.',
      token: command('node', [
        'scripts/forge-token.mjs',
        '--sub',
        analystOne.userId,
        '--username',
        'analyst.one',
        '--token-version',
        '1',
        '--algorithm',
        'none',
      ]),
    },
  ];

  for (const testCase of cases) {
    const result = await httpCase(
      id,
      title,
      testCase.name,
      testCase.description,
      'POST',
      `${STEGO}/api/v1/steganography/analyze`,
      {
        ...(testCase.token ? { token: testCase.token } : {}),
        form: fileForm('file', 'ms-stego/samples/original.png', 'image/png'),
      },
    );
    assert(result.status === 401, `${testCase.name} must return 401`);
  }
}

/* -------------------------------------------------------------------------- */
/* T04 — USER cannot analyze                                                  */
/* -------------------------------------------------------------------------- */

{
  const id = 'T04';
  const title = 'El rol USER no puede analizar';

  const before = dbCount('analyses');

  const result = await httpCase(
    id,
    title,
    'USER intenta analizar',
    'AUTH responde allowed=false y STEGO devuelve 403 antes de procesar el archivo.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: userStandard.token,
      form: fileForm('file', 'ms-stego/samples/lsb-payload.png', 'image/png'),
    },
  );
  assert(result.status === 403, 'USER analyze must return 403');

  const after = dbCount('analyses');
  addCase(id, title, {
    kind: 'database',
    name: 'No se creó un análisis',
    description: 'Conteo de analyses antes y después de la denegación.',
    before,
    after,
    unchanged: before === after,
  });
  assert(before === after, 'USER denial must not create an analysis');
}

/* -------------------------------------------------------------------------- */
/* T05 and T06 — N:M assignments and duplicate handling                       */
/* -------------------------------------------------------------------------- */

const suffix = String(Date.now()).slice(-8);
const userA = {
  username: `evidence.a.${suffix}`,
  cedula: `17${suffix}`,
  telefono: `09${suffix}`,
  email: `evidence.a.${suffix}@demo.local`,
};
const userB = {
  username: `evidence.b.${suffix}`,
  cedula: `18${suffix}`,
  telefono: `08${suffix}`,
  email: `evidence.b.${suffix}@demo.local`,
};
let createdA;
let createdB;

try {
  const rolesResult = await httpCase(
    'T05',
    'Asignaciones N:M y duplicados',
    'Catálogo de roles',
    'Se resuelven los identificadores de ADMIN, ANALYST y USER.',
    'GET',
    `${AUTH}/api/v1/roles?page=1&limit=20`,
    { token: admin.token },
  );
  assert(rolesResult.status === 200, 'roles must return 200');

  const roleId = Object.fromEntries(
    rolesResult.body.data.map((role) => [role.rol, role.id]),
  );
  assert(roleId.ADMIN && roleId.ANALYST && roleId.USER, 'roles must exist');

  const createUser = async (data) =>
    httpCase(
      'T05',
      'Asignaciones N:M y duplicados',
      `Crear ${data.username}`,
      'Usuario desechable para la evidencia; se elimina al final.',
      'POST',
      `${AUTH}/api/v1/users`,
      {
        token: admin.token,
        json: {
          cedula: data.cedula,
          nombres: 'Evidence',
          apellidos: 'Temporal',
          fechaNacimiento: '1995-06-06',
          username: data.username,
          email: data.email,
          telefono: data.telefono,
          password: PASSWORD,
        },
      },
    );

  const resultA = await createUser(userA);
  assert(resultA.status === 201, 'user A must be created');
  createdA = resultA.body;

  const resultB = await createUser(userB);
  assert(resultB.status === 201, 'user B must be created');
  createdB = resultB.body;

  const assignments = [
    ['T05', 'Asignar ADMIN a A', createdA.id, roleId.ADMIN, 201],
    ['T05', 'Asignar ANALYST a A', createdA.id, roleId.ANALYST, 201],
    ['T05', 'Asignar ADMIN a B', createdB.id, roleId.ADMIN, 201],
    ['T05', 'Asignar USER a B', createdB.id, roleId.USER, 201],
  ];

  for (const [folder, name, userId, role, expected] of assignments) {
    const result = await httpCase(
      folder,
      'Asignaciones N:M y duplicados',
      name,
      'Una fila por par usuario–rol.',
      'POST',
      `${AUTH}/api/v1/user-roles`,
      { token: admin.token, json: { userId, roleId: role } },
    );
    assert(result.status === expected, `${name} must return ${expected}`);
  }

  const rolesA = await httpCase(
    'T05',
    'Asignaciones N:M y duplicados',
    'A tiene dos roles',
    'Un usuario acumula ADMIN y ANALYST.',
    'GET',
    `${AUTH}/api/v1/user-roles/user/${createdA.id}`,
    { token: admin.token },
  );
  assert(rolesA.status === 200, 'user A assignments must return 200');
  assert(
    rolesA.body.filter((item) => item.estado).length === 2,
    'user A must have two active roles',
  );

  const shared = await httpCase(
    'T05',
    'Asignaciones N:M y duplicados',
    'ADMIN está asignado a dos usuarios',
    'El mismo rol aparece en más de un usuario.',
    'GET',
    `${AUTH}/api/v1/user-roles?page=1&limit=50&roleId=${roleId.ADMIN}`,
    { token: admin.token },
  );
  assert(shared.status === 200, 'shared role query must return 200');
  assert(
    shared.body.data.filter(
      (item) => item.userId === createdA.id || item.userId === createdB.id,
    ).length === 2,
    'ADMIN must be shared by users A and B',
  );

  const duplicate = await httpCase(
    'T06',
    'Asignaciones N:M y duplicados',
    'Repetir una asignación activa',
    'El par usuario–rol ya existe; AUTH responde 409 y no crea otra fila.',
    'POST',
    `${AUTH}/api/v1/user-roles`,
    {
      token: admin.token,
      json: { userId: createdA.id, roleId: roleId.ADMIN },
    },
  );
  assert(duplicate.status === 409, 'duplicate assignment must return 409');

  const afterDuplicate = await httpCase(
    'T06',
    'Asignaciones N:M y duplicados',
    'Solo existe una asignación ADMIN para A',
    'La consulta confirma que el intento duplicado no insertó otra fila.',
    'GET',
    `${AUTH}/api/v1/user-roles/user/${createdA.id}`,
    { token: admin.token },
  );
  assert(
    afterDuplicate.body.filter(
      (item) => item.roleId === roleId.ADMIN && item.estado,
    ).length === 1,
    'duplicate attempt must not create a second row',
  );
} finally {
  for (const user of [createdA, createdB]) {
    if (!user) {
      continue;
    }

    const result = await request('DELETE', `${AUTH}/api/v1/users/${user.id}`, {
      token: admin.token,
    });
    addCase('T05', 'Asignaciones N:M y duplicados', {
      kind: 'http',
      name: `Eliminar ${user.username}`,
      description: 'Limpieza del usuario desechable de la evidencia.',
      request: {
        method: 'DELETE',
        url: '<AUTH>/api/v1/users/<id>',
        authenticated: true,
      },
      status: result.status,
      requestId: result.requestId,
      response: result.body,
    });
    assert(result.status === 204, 'evidence user must be deleted');
  }
}

/* -------------------------------------------------------------------------- */
/* T07 — revocation with the same JWT                                         */
/* -------------------------------------------------------------------------- */

{
  const id = 'T07';
  const title = 'Retiro de rol con el mismo JWT';

  const before = await httpCase(
    id,
    title,
    'ANALYST analiza antes del retiro',
    'El JWT sigue siendo el mismo durante toda la prueba.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      form: fileForm('file', 'ms-stego/samples/original.png', 'image/png'),
    },
  );
  assert(before.status === 200, 'ANALYST must analyze before revocation');

  const roles = await request(
    'GET',
    `${AUTH}/api/v1/roles?page=1&limit=20`,
    { token: admin.token },
  );
  const analystRoleId = roles.body.data.find(
    (role) => role.rol === 'ANALYST',
  ).id;

  const assignments = await request(
    'GET',
    `${AUTH}/api/v1/user-roles/user/${analystOne.userId}`,
    { token: admin.token },
  );
  const assignment = assignments.body.find(
    (item) => item.roleId === analystRoleId && item.estado,
  );
  assert(assignment, 'ANALYST assignment must exist before revocation');

  const revoked = await httpCase(
    id,
    title,
    'Retirar la asignación ANALYST',
    'Se elimina la asignación, no el usuario ni el JWT.',
    'DELETE',
    `${AUTH}/api/v1/user-roles/${assignment.id}`,
    { token: admin.token },
  );
  assert(revoked.status === 204, 'role assignment must be revoked');

  const denied = await httpCase(
    id,
    title,
    'El mismo JWT recibe 403',
    'AUTH consulta los roles vigentes en cada solicitud; el token no cambió.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      form: fileForm('file', 'ms-stego/samples/original.png', 'image/png'),
    },
  );
  assert(denied.status === 403, 'revoked role must receive 403');

  const restored = await httpCase(
    id,
    title,
    'Restaurar la asignación ANALYST',
    'Se vuelve a crear el par usuario–rol para dejar el seed como estaba.',
    'POST',
    `${AUTH}/api/v1/user-roles`,
    {
      token: admin.token,
      json: { userId: analystOne.userId, roleId: analystRoleId },
    },
  );
  assert(restored.status === 201, 'role assignment must be restored');

  const allowed = await httpCase(
    id,
    title,
    'El mismo JWT vuelve a recibir 200',
    'La decisión se recalcula; no se reutiliza la autorización anterior.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      form: fileForm('file', 'ms-stego/samples/original.png', 'image/png'),
    },
  );
  assert(allowed.status === 200, 'restored role must receive 200');

  addCase(id, title, {
    kind: 'jwt',
    name: 'Huella del JWT sin exponerlo',
    description:
      'SHA-256 del token usado en las cuatro solicitudes; demuestra que no se reemplazó.',
    sha256: command('node', [
      '-e',
      "const {createHash}=require('node:crypto');process.stdout.write(createHash('sha256').update(process.argv[1]).digest('hex'))",
      analystOne.token,
    ]),
  });
}

/* -------------------------------------------------------------------------- */
/* T08 — AUTH unavailable                                                     */
/* -------------------------------------------------------------------------- */

{
  const id = 'T08';
  const title = 'Fallo seguro cuando AUTH no está disponible';

  const before = dbCount('analyses');
  const stop = shell('docker compose stop auth auth-api');
  commandCase(
    id,
    title,
    'Detener el terminador TLS y la API de AUTH',
    'docker compose stop auth auth-api',
    stop,
  );

  try {
    const result = await httpCase(
      id,
      title,
      'Analizar con AUTH detenido',
      'STEGO no puede verificar ni autorizar; devuelve 503 sin procesar el archivo.',
      'POST',
      `${STEGO}/api/v1/steganography/analyze`,
      {
        token: analystOne.token,
        form: fileForm('file', 'ms-stego/samples/lsb-payload.png', 'image/png'),
      },
    );
    assert(result.status === 503, 'AUTH outage must return 503');

    const after = dbCount('analyses');
    addCase(id, title, {
      kind: 'database',
      name: 'No se creó un análisis durante la caída',
      description: 'Conteo de analyses antes y después del 503.',
      before,
      after,
      unchanged: before === after,
    });
    assert(before === after, 'AUTH outage must not create an analysis');
  } finally {
    const startApi = shell('docker compose start auth-api');
    commandCase(
      id,
      title,
      'Reiniciar auth-api',
      'docker compose start auth-api',
      startApi,
    );
    const startTls = shell('docker compose start auth');
    commandCase(
      id,
      title,
      'Reiniciar el terminador TLS',
      'docker compose start auth',
      startTls,
    );
    await waitFor(`${AUTH}/api/v1/health`, 90);
  }

  const recovered = await httpCase(
    id,
    title,
    'Analizar después de recuperar AUTH',
    'El mismo JWT vuelve a funcionar cuando AUTH está disponible.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      form: fileForm('file', 'ms-stego/samples/original.png', 'image/png'),
    },
  );
  assert(recovered.status === 200, 'analysis must recover after AUTH restart');
}

/* -------------------------------------------------------------------------- */
/* T09 — LSB detection samples                                                */
/* -------------------------------------------------------------------------- */

const samples = [
  ['original.png', 'PNG original sin carga conocida'],
  ['lsb-payload.png', 'PNG con carga LSB conocida'],
  ['original.bmp', 'BMP original sin carga conocida'],
  ['lsb-payload.bmp', 'BMP con carga LSB conocida'],
  ['noise-control.png', 'Ruido sin carga: falso positivo conocido'],
  ['small.png', 'Imagen pequeña: resultado no concluyente'],
  ['flat-control.png', 'Imagen uniforme: diversidad insuficiente'],
];
let t09PayloadAnalysis;

for (const [file, name] of samples) {
  const result = await httpCase(
    'T09',
    'Detección LSB sobre muestras reproducibles',
    name,
    'Muestra sintética del manifiesto de STEGO; las métricas no son una medida de precisión real.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      form: fileForm('file', `ms-stego/samples/${file}`, file.endsWith('.bmp') ? 'image/bmp' : 'image/png'),
    },
  );
  assert(result.status === 200, `${name} must return 200`);
  assert(result.body.analysis_id, `${name} must return an analysis id`);

  if (file === 'lsb-payload.png') {
    t09PayloadAnalysis = {
      ...result.body,
      requestId: result.requestId,
    };
  }
}

assert(t09PayloadAnalysis, 'T09 must create the payload analysis');

/* -------------------------------------------------------------------------- */
/* T10 — upload validation                                                    */
/* -------------------------------------------------------------------------- */

{
  command(
    'node',
    ['scripts/postman/prepare-files.mjs'],
    { cwd: resolve(root, 'ms-stego') },
  );

  const cases = [
    {
      name: 'Imagen corrupta',
      file: 'ms-stego/samples/corrupt.png',
      type: 'image/png',
      expected: 400,
    },
    {
      name: 'Extensión falsa',
      file: 'ms-stego/samples/false-extension.png',
      type: 'image/png',
      expected: 415,
    },
    {
      name: 'Archivo demasiado grande',
      file: 'ms-stego/postman/files/oversized.png',
      type: 'image/png',
      expected: 413,
    },
    {
      name: 'Archivo vacío',
      file: 'ms-stego/postman/files/empty.png',
      type: 'image/png',
      expected: 400,
    },
    {
      name: 'Campo de archivo incorrecto',
      file: 'ms-stego/samples/original.png',
      field: 'image',
      type: 'image/png',
      expected: 400,
    },
    {
      name: 'Firma y formato inconsistentes',
      file: 'ms-stego/postman/files/mismatched.bmp',
      type: 'image/bmp',
      expected: 400,
    },
  ];

  for (const testCase of cases) {
    const result = await httpCase(
      'T10',
      'Validación de archivos y límites de carga',
      testCase.name,
      `Se espera HTTP ${testCase.expected} antes de cualquier análisis.`,
      'POST',
      `${STEGO}/api/v1/steganography/analyze`,
      {
        token: analystOne.token,
        form: fileForm(
          testCase.field ?? 'file',
          testCase.file,
          testCase.type,
        ),
      },
    );
    assert(
      result.status === testCase.expected,
      `${testCase.name} must return ${testCase.expected}`,
    );
  }

  const json = await httpCase(
    'T10',
    'Validación de archivos y límites de carga',
    'JSON en lugar de multipart',
    'El endpoint solo acepta multipart/form-data.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      json: { file: 'not-an-upload' },
    },
  );
  assert(json.status === 415, 'JSON body must return 415');
}

/* -------------------------------------------------------------------------- */
/* T11 — ownership                                                            */
/* -------------------------------------------------------------------------- */

{
  const id = 'T11';
  const title = 'Propiedad de resultados: propio, ajeno y ADMIN';

  const created = await httpCase(
    id,
    title,
    'ANALYST uno crea un análisis',
    'El propietario es siempre el sujeto autenticado; el cliente no puede elegirlo.',
    'POST',
    `${STEGO}/api/v1/steganography/analyze`,
    {
      token: analystOne.token,
      form: fileForm('file', 'ms-stego/samples/lsb-payload.png', 'image/png'),
    },
  );
  assert(created.status === 200, 'owner analysis must return 200');
  const analysisId = created.body.analysis_id;

  const own = await httpCase(
    id,
    title,
    'El propietario lee su resultado',
    'Alcance own: user_id coincide con subject_id.',
    'GET',
    `${STEGO}/api/v1/steganography/results/${analysisId}`,
    { token: analystOne.token },
  );
  assert(own.status === 200, 'owner read must return 200');

  const other = await httpCase(
    id,
    title,
    'Otro ANALYST no puede leerlo',
    'El rol permite consultar, pero el alcance own exige propiedad.',
    'GET',
    `${STEGO}/api/v1/steganography/results/${analysisId}`,
    { token: analystTwo.token },
  );
  assert(other.status === 403, 'other ANALYST must receive 403');

  const adminRead = await httpCase(
    id,
    title,
    'ADMIN puede leer cualquier resultado',
    'El rol ADMIN obtiene alcance any.',
    'GET',
    `${STEGO}/api/v1/steganography/results/${analysisId}`,
    { token: admin.token },
  );
  assert(adminRead.status === 200, 'ADMIN read must return 200');

  const userRead = await httpCase(
    id,
    title,
    'USER no puede leer resultados',
    'USER no tiene permiso para la acción de lectura.',
    'GET',
    `${STEGO}/api/v1/steganography/results/${analysisId}`,
    { token: userStandard.token },
  );
  assert(userRead.status === 403, 'USER read must return 403');

  const missing = await httpCase(
    id,
    title,
    'Resultado inexistente con permiso',
    'Primero se autoriza y después se busca; un usuario autorizado recibe 404.',
    'GET',
    `${STEGO}/api/v1/steganography/results/00000000-0000-4000-8000-000000000001`,
    { token: analystOne.token },
  );
  assert(missing.status === 404, 'missing result must return 404');
}

/* -------------------------------------------------------------------------- */
/* T12 — audit and correlation                                                */
/* -------------------------------------------------------------------------- */

{
  const id = 'T12';
  const title = 'Auditoría depurada y correlación por request ID';

  const authAudit = await httpCase(
    id,
    title,
    'Auditoría de AUTH para ADMIN',
    'La respuesta no contiene JWT, contraseñas ni secretos HMAC.',
    'GET',
    `${AUTH}/api/v1/audit-events?page=1&limit=50`,
    { token: admin.token },
  );
  assert(authAudit.status === 200, 'AUTH audit must return 200');
  assert(
    Array.isArray(authAudit.body.data) && authAudit.body.data.length > 0,
    'AUTH audit must return events',
  );

  const authAuditText = JSON.stringify(authAudit.body);
  assert(!authAuditText.includes('eyJ'), 'AUTH audit must not contain JWTs');
  assert(
    !/password/i.test(authAuditText),
    'AUTH audit must not contain passwords',
  );

  const authAuditUser = await httpCase(
    id,
    title,
    'Auditoría de AUTH prohibida a USER',
    'Solo ADMIN puede consultar los eventos.',
    'GET',
    `${AUTH}/api/v1/audit-events?page=1&limit=5`,
    { token: userStandard.token },
  );
  assert(authAuditUser.status === 403, 'USER audit must return 403');

  const analysisRows = dbJson(
    `select analysis_id, user_id, sha256, technique, status, action, quarantine_state from analyses where analysis_id = '${t09PayloadAnalysis.analysis_id}'`,
  );
  addCase(id, title, {
    kind: 'database',
    name: 'Resultado persistido en la base de STEGO',
    description:
      'El análisis conserva hash, técnica, clasificación, política y estado de cuarentena.',
    rows: analysisRows,
  });
  assert(analysisRows.length === 1, 'analysis must be persisted in STEGO');

  const auditRows = dbJson(
    `select created_at, request_id, subject_id, resource_id, event, action, outcome, http_status, details from audit_events where resource_id = '${t09PayloadAnalysis.analysis_id}' order by created_at`,
  );
  addCase(id, title, {
    kind: 'database',
    name: 'Eventos de auditoría de STEGO',
    description:
      'Los eventos se correlacionan con el análisis y no incluyen el JWT ni el contenido de la imagen.',
    rows: auditRows,
  });
  assert(auditRows.length > 0, 'STEGO audit must contain the analysis events');

  const requestCorrelation = dbJson(
    `select count(*)::int as events, count(distinct request_id)::int as requests from audit_events where request_id = '${t09PayloadAnalysis.requestId}'`,
  );
  addCase(id, title, {
    kind: 'database',
    name: 'Correlación por request ID',
    description:
      'El identificador de la respuesta de análisis aparece en los eventos persistidos.',
    rows: requestCorrelation,
  });
  assert(
    requestCorrelation[0].events > 0 && requestCorrelation[0].requests === 1,
    'audit events must correlate with the analyze request id',
  );

  const secretLeak = dbJson(
    `select count(*)::int as leaks from audit_events where details::text ilike '%eyJ%' or details::text ilike '%password%' or details::text ilike '%subject_token%'`,
  );
  addCase(id, title, {
    kind: 'database',
    name: 'Sin credenciales en los detalles de auditoría',
    description:
      'Búsqueda de JWT, contraseñas y subject_token en el JSON de detalles.',
    rows: secretLeak,
  });
  assert(secretLeak[0].leaks === 0, 'STEGO audit must not leak credentials');
}

/* -------------------------------------------------------------------------- */
/* Write the evidence package                                                 */
/* -------------------------------------------------------------------------- */

mkdirSync(evidenceRoot, { recursive: true });

const summary = [];

for (const [id, data] of [...captures.entries()].sort()) {
  const folder = resolve(evidenceRoot, id);
  mkdirSync(folder, { recursive: true });

  const lines = [
    `# ${id} — ${data.title}`,
    '',
    `Generado: ${startedAt}`,
    `Commit: \`${commit}\` — ${commitSubject}`,
    '',
  ];

  for (const testCase of data.cases) {
    lines.push(`## ${testCase.name}`, '');
    if (testCase.description) {
      lines.push(testCase.description, '');
    }

    if (testCase.kind === 'http') {
      lines.push(
        `- Solicitud: \`${testCase.request.method} ${testCase.request.url}\``,
        `- Autenticada: ${testCase.request.authenticated ? 'sí' : 'no'}`,
        `- HTTP: **${testCase.status}**`,
        `- X-Request-Id: \`${testCase.requestId ?? 'no aplica'}\``,
        '',
        'Respuesta:',
        '',
        '```json',
        JSON.stringify(testCase.response, null, 2),
        '```',
        '',
      );
    } else if (testCase.kind === 'command') {
      lines.push(
        `Comando:`,
        '',
        '```bash',
        testCase.command,
        '```',
        '',
        'Salida:',
        '',
        '```text',
        testCase.output,
        '```',
        '',
      );
    } else if (testCase.kind === 'jwt') {
      lines.push(
        'Cabecera:',
        '',
        '```json',
        JSON.stringify(testCase.header ?? testCase, null, 2),
        '```',
        '',
        ...(testCase.payload
          ? [
              'Payload:',
              '',
              '```json',
              JSON.stringify(testCase.payload, null, 2),
              '```',
              '',
            ]
          : []),
      );
    } else if (testCase.kind === 'database') {
      lines.push(
        '```json',
        JSON.stringify(
          testCase.rows ?? {
            before: testCase.before,
            after: testCase.after,
            unchanged: testCase.unchanged,
          },
          null,
          2,
        ),
        '```',
        '',
      );
    }
  }

  writeFileSync(resolve(folder, 'capture.md'), `${lines.join('\n')}\n`);
  writeFileSync(
    resolve(folder, 'capture.json'),
    `${JSON.stringify({ id, title: data.title, environment, cases: data.cases }, null, 2)}\n`,
  );

  summary.push(
    `| ${id} | ${data.title} | ${data.cases.length} | [capture.md](${id}/capture.md) |`,
  );
  console.log(`[evidence] ${id}: ${data.cases.length} cases`);
}

const readme = [
  '# Evidencias de integración AUTH–STEGO',
  '',
  'Capturas generadas contra el despliegue real de Docker Compose, con tokens',
  'emitidos por AUTH y análisis ejecutados por STEGO. Las respuestas están',
  'depuradas: no incluyen JWT, contraseñas, secretos HMAC ni contenido de imagen.',
  '',
  `- Fecha: ${startedAt}`,
  `- Commit: \`${commit}\` — ${commitSubject}`,
  `- Node: ${environment.node}`,
  `- Docker: ${environment.docker}`,
  `- Compose: ${environment.compose}`,
  '',
  '| Prueba | Tema | Casos | Evidencia |',
  '| --- | --- | --- | --- |',
  ...summary,
  '',
  '## Reproducir',
  '',
  '```bash',
  'docker compose up -d --wait',
  'docker compose --profile tools run --rm migrate',
  'docker compose --profile tools run --rm stego-migrate',
  'docker compose --profile seed run --rm seed',
  'NODE_EXTRA_CA_CERTS=docker/certs/auth-ca.pem node scripts/capture-evidence.mjs',
  '```',
  '',
  'T08 detiene `auth` y `auth-api` y los reinicia al terminar. El script exige',
  'que el seed ya exista y que el stack esté sano.',
  '',
].join('\n');

writeFileSync(resolve(evidenceRoot, 'README.md'), readme);

console.log(`[evidence] wrote ${evidenceRoot}`);
console.log(`[evidence] finished in ${Math.round(process.uptime())} s`);
