import 'dotenv/config';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Run the real compiled HTTP application against a disposable database.
// Never seed, delete or modify the developer's user_db from these tests.
const database = `workshop_test_${randomUUID().replaceAll('-', '')}`;
const adminDb = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
});
let server: ChildProcess | undefined;
let created = false;
let connected = false;
let base = '';
let logs = '';
let admin = '';
let operator = '';
let customer = '';
let userId = '';
let roleId = '';
const password = 'WorkshopTest2026!';
const user = {
  cedula: '1712345678', nombres: 'Pedro Andrés', apellidos: 'Salazar Torres',
  fechaNacimiento: '1993-04-18', username: 'psalazar',
  email: 'psalazar@example.com', telefono: '0987654321', password, estado: true,
};

async function api(method: string, path: string, token = '', body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

beforeAll(async () => {
  await adminDb.connect();
  connected = true;
  await adminDb.query(`CREATE DATABASE "${database}"`);
  created = true;
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const env = { ...process.env, DB_DATABASE: database, NODE_ENV: 'test', PORT: String(port) };
  execFileSync(process.execPath, ['node_modules/typeorm/cli.js', 'migration:run', '-d', 'dist/database/data-source.js'], { env, stdio: 'pipe' });
  execFileSync(process.execPath, ['dist/database/seed.js'], { env, stdio: 'pipe' });
  server = spawn(process.execPath, ['dist/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', (data) => { logs += data.toString(); });
  server.stderr?.on('data', (data) => { logs += data.toString(); });
  base = `http://127.0.0.1:${port}/api/v1`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Application exited: ${logs}`);
    try { if ((await api('GET', '/health')).status === 200) { ready = true; break; } } catch { /* Wait for readiness. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Application did not start: ${logs}`);
}, 60000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const timer = setTimeout(() => server?.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  }
  if (created) await adminDb.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  if (connected) await adminDb.end();
}, 15000);

describe.sequential('Taller: endpoints reales y seguridad', () => {
  it('health es público y entrega request ID y cabeceras de seguridad', async () => {
    const r = await api('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'user-service' });
    expect(r.headers.get('x-request-id')).toBeTruthy();
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('sin token devuelve 401', async () => {
    expect((await api('GET', '/users')).status).toBe(401);
  });
  it('login funciona para ADMIN, OPERADOR y CLIENTE', async () => {
    for (const [identifier, role] of [['jperez', 'ADMIN'], ['amendoza', 'OPERADOR'], ['mgomez', 'CLIENTE']]) {
      const r = await api('POST', '/auth/login', '', { identifier, password: 'ClaveSegura2026!' });
      expect(r.status).toBe(200);
      expect(r.body.user.roles).toContain(role);
      expect(r.body.tokenType).toBe('Bearer');
      if (role === 'ADMIN') admin = r.body.accessToken;
      if (role === 'OPERADOR') operator = r.body.accessToken;
      if (role === 'CLIENTE') customer = r.body.accessToken;
    }
  });
  it('consulta el usuario autenticado', async () => {
    const r = await api('GET', '/auth/me', admin);
    expect(r.status).toBe(200);
    expect(r.body.username).toBe('jperez');
  });
  it('CLIENTE no puede listar usuarios', async () => {
    expect((await api('GET', '/users', customer)).status).toBe(403);
  });
  it('OPERADOR puede listar pero no crear usuarios', async () => {
    expect((await api('GET', '/users', operator)).status).toBe(200);
    expect((await api('POST', '/users', operator, user)).status).toBe(403);
  });
  it('rechaza mass assignment', async () => {
    expect((await api('POST', '/users', admin, { ...user, isAdmin: true })).status).toBe(400);
  });
  it('rechaza contraseñas cortas', async () => {
    expect((await api('POST', '/users', admin, { ...user, password: 'short' })).status).toBe(400);
  });
  it('crea usuario sin exponer contraseña ni hash', async () => {
    const r = await api('POST', '/users', admin, user);
    expect(r.status).toBe(201);
    userId = r.body.id;
    expect(userId).toBeTruthy();
    expect(r.body.password).toBeUndefined();
    expect(r.body.passwordHash).toBeUndefined();
  });
  it('rechaza usuario duplicado', async () => {
    expect((await api('POST', '/users', admin, user)).status).toBe(409);
  });
  it('lista usuarios paginados', async () => {
    const r = await api('GET', '/users?page=1&limit=2', admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(2);
    expect(r.body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(JSON.stringify(r.body)).not.toContain('passwordHash');
  });
  it('rechaza paginación mayor de 100', async () => {
    expect((await api('GET', '/users?limit=101', admin)).status).toBe(400);
  });
  it('consulta usuario por UUID y cédula', async () => {
    expect((await api('GET', `/users/${userId}`, admin)).body.username).toBe(user.username);
    expect((await api('GET', `/users/cedula/${user.cedula}`, admin)).body.id).toBe(userId);
  });
  it('rechaza UUID y cédula inválidos', async () => {
    expect((await api('GET', '/users/not-a-uuid', admin)).status).toBe(400);
    expect((await api('GET', '/users/cedula/abc', admin)).status).toBe(400);
  });
  it('actualiza usuario y verifica persistencia', async () => {
    expect((await api('PATCH', `/users/${userId}`, admin, { nombres: 'Pedro Actualizado' })).status).toBe(200);
    expect((await api('GET', `/users/${userId}`, admin)).body.nombres).toBe('Pedro Actualizado');
  });
  it('crea rol', async () => {
    const r = await api('POST', '/roles', admin, { rol: 'AUDITOR_TEST', estado: true });
    expect(r.status).toBe(201);
    roleId = r.body.id;
    expect(roleId).toBeTruthy();
  });
  it('lista y consulta roles', async () => {
    expect((await api('GET', '/roles', operator)).status).toBe(200);
    expect((await api('GET', `/roles/${roleId}`, admin)).body.rol).toBe('AUDITOR_TEST');
  });
  it('actualiza rol y verifica persistencia', async () => {
    expect((await api('PATCH', `/roles/${roleId}`, admin, { rol: 'AUDITOR_ACTUALIZADO' })).status).toBe(200);
    expect((await api('GET', `/roles/${roleId}`, admin)).body.rol).toBe('AUDITOR_ACTUALIZADO');
  });
  it('asigna rol y consulta la relación persistida', async () => {
    expect((await api('POST', '/user-roles', admin, { userId, roleId })).status).toBe(201);
    const r = await api('GET', `/user-roles/user/${userId}`, admin);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain(roleId);
  });
  it('OPERADOR no puede asignar roles', async () => {
    expect((await api('POST', '/user-roles', operator, { userId, roleId })).status).toBe(403);
  });
  it('los roles cambian desde BD sin renovar JWT', async () => {
    const r = await api('POST', '/auth/login', '', { identifier: user.username, password });
    expect(r.status).toBe(200);
    const token = r.body.accessToken;
    expect((await api('GET', '/auth/me', token)).body.roles).toContain('AUDITOR_ACTUALIZADO');
    expect((await api('DELETE', `/user-roles/${userId}/${roleId}`, admin)).status).toBe(204);
    expect((await api('GET', '/auth/me', token)).body.roles).not.toContain('AUDITOR_ACTUALIZADO');
  });
  it('elimina rol lógicamente', async () => {
    expect((await api('DELETE', `/roles/${roleId}`, admin)).status).toBe(204);
    expect((await api('GET', `/roles/${roleId}`, admin)).status).toBe(404);
  });
  it('elimina usuario lógicamente', async () => {
    expect((await api('DELETE', `/users/${userId}`, admin)).status).toBe(204);
    expect((await api('GET', `/users/${userId}`, admin)).status).toBe(404);
  });
  it('token manipulado devuelve 401', async () => {
    const parts = admin.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: userId, typ: 'access', tokenVersion: 0 })).toString('base64url');
    expect((await api('GET', '/auth/me', parts.join('.'))).status).toBe(401);
  });
  it('logout invalida el token anterior', async () => {
    expect((await api('POST', '/auth/logout', admin)).status).toBe(204);
    expect((await api('GET', '/auth/me', admin)).status).toBe(401);
  });
  it('login incorrecto es genérico y se limita a cinco intentos por minuto', async () => {
    const body = { identifier: 'missing', password: 'IncorrectPassword2026!' };
    expect((await api('POST', '/auth/login', '', body)).status).toBe(401);
    expect((await api('POST', '/auth/login', '', body)).status).toBe(429);
  });
});
