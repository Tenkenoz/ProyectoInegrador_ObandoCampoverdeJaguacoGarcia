# Microservicio de Autenticación

## Requisitos

- Node.js 22 o superior
- pnpm 11.26.0 o superior
- Docker y Docker Compose
- Una copia de `.env` basada en `example.env.dist`

```bash
cp example.env.dist .env
```

Ajuste `DB_PASSWORD` y genere las claves JWT antes de continuar.

## Instalación

```bash
pnpm install --frozen-lockfile
```

## Base de datos

```bash
docker compose up -d --wait
pnpm migration:run
```

`migration:run` crea las tablas `users`, `roles` y `user_roles`. La migración
también inserta los roles `ADMIN`, `ANALYST` y `USER` y agrega el `id` propio de
cada asignación usuario-rol. Los usuarios se crean después mediante la API o
directamente en PostgreSQL.

## Claves JWT (RS256)

Genere el par de claves RSA localmente:

```bash
pnpm keys:generate
```

El comando escribe `keys/jwt-private.pem` y `keys/jwt-public.pem`, y muestra el
`kid` calculado. Copie los valores impresos a `.env`:

```dotenv
JWT_PRIVATE_KEY_PATH=keys/jwt-private.pem
JWT_PUBLIC_KEY_PATH=keys/jwt-public.pem
JWT_KEY_ID=<kid-generado>
```

La clave privada nunca se versiona y no se comparte con STEGO. STEGO solo consume
la clave pública publicada en `GET /.well-known/jwks.json`.

## Roles y perfil

La base de datos solo admite los roles `ADMIN`, `ANALYST` y `USER`. Los
endpoints principales de identidad son:

```text
GET    /api/v1/auth/profile
GET    /api/v1/user-roles?page=1&limit=20&userId=&roleId=&estado=
PATCH  /api/v1/user-roles/:id
DELETE /api/v1/user-roles/:id
```

`PATCH` y `DELETE` operan sobre el `id` propio de la asignación usuario-rol.
`DELETE` revoca la asignación (`estado = false`); repetir `POST /user-roles`
reactiva la misma fila sin crear un duplicado.

Matriz de permisos:

| Rol | Administrar usuarios/roles | Ver su perfil | Analizar en STEGO | Ver resultados STEGO |
| --- | --- | --- | --- | --- |
| `ADMIN` | Sí | Sí | Sí, alcance `any` | Todos, alcance `any` |
| `ANALYST` | No | Sí | Sí, alcance `own` | Propios, alcance `own` |
| `USER` | No | Solo el propio | No | No |

Los endpoints de administración de AUTH exigen `ADMIN`. Cualquier usuario
autenticado puede consultar únicamente su propio perfil.

## Autorización interna AUTH–STEGO

AUTH expone fuera del prefijo `/api/v1`:

```http
POST /internal/authorization/check
```

La solicitud usa autenticación HMAC-SHA256 con las cabeceras:

```text
X-Service-Id: stego
X-Service-Timestamp: <segundos Unix>
X-Service-Nonce: <32 bytes aleatorios en 64 caracteres hexadecimales>
X-Service-Signature: <HMAC-SHA256 en 64 caracteres hexadecimales>
```

El secreto se comparte con STEGO y se configura con
`AUTH_SERVICE_SECRET` (64 caracteres hexadecimales):

```bash
openssl rand -hex 32
```

Variables relacionadas:

```dotenv
AUTH_SERVICE_ID=stego
AUTH_SERVICE_SECRET=<secreto-compartido>
AUTH_HMAC_CLOCK_SKEW_SECONDS=30
AUTH_HMAC_NONCE_TTL_SECONDS=60
AUTH_HMAC_NONCE_CACHE_SIZE=10000
```

Contrato de ejemplo:

```json
{
  "subject_token": "<JWT_RS256>",
  "action": "steganography.analyze",
  "resource_id": null
}
```

La respuesta es `200` tanto para permitir como para denegar por permisos:

```json
{
  "subject_id": "<uuid>",
  "action": "steganography.analyze",
  "resource_id": null,
  "allowed": true,
  "scope": "any",
  "reason": "active_role_grants_permission"
}
```

La caché de nonces es en memoria y está pensada para una sola instancia de AUTH.
Con varias réplicas se requiere almacenamiento compartido.

## Auditoría

AUTH registra eventos en `audit_events` sin almacenar contraseñas, JWT completos
ni secretos HMAC. Los eventos incluyen:

- `auth.login.succeeded`
- `auth.login.failed`
- `auth.logout`
- `user_role.assigned`
- `user_role.reactivated`
- `user_role.assignment_denied`
- `user_role.updated`
- `user_role.revoked`
- `authorization.allowed`
- `authorization.denied`
- `authorization.failed`
- `service_auth.failed`

Consulta de evidencia para T12:

```http
GET /api/v1/audit-events?page=1&limit=50
Authorization: Bearer <JWT_ADMIN>
```

También se puede consultar directamente:

```sql
SELECT
  occurred_at,
  event_type,
  actor_id,
  subject_id,
  action,
  resource_id,
  decision,
  reason,
  request_id
FROM audit_events
ORDER BY occurred_at DESC;
```

## Ejecutar la aplicación

```bash
pnpm start:dev
```

Para producción:

```bash
pnpm build
pnpm start:prod
```

## Pruebas y calidad

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
pnpm openapi:check
```

Las pruebas unitarias usan Vitest. Las pruebas e2e usan Vitest y Supertest.
Las pruebas de integración requieren PostgreSQL y se ejecutan con:

```bash
RUN_DB_TESTS=true \
DB_HOST=127.0.0.1 \
DB_PORT=55432 \
DB_USERNAME=user_app \
DB_PASSWORD='<password>' \
DB_DATABASE=auth_test \
pnpm test:integration
```

Las convenciones de código, commits, casing y manejo de secretos están en
[`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Acceso

- API: `http://localhost:3001/api/v1`
- Health: `http://localhost:3001/api/v1/health`
- JWKS: `http://localhost:3001/.well-known/jwks.json`
- Swagger: `http://localhost:3001/docs`

## Insertar el primer administrador

Los roles `ADMIN`, `ANALYST` y `USER` ya existen después de `migration:run`.
El primer usuario administrador debe insertarse manualmente. Genere el hash de
la contraseña con Argon2:

```bash
node -e "const a=require('argon2'); a.hash('TuClaveSegura2026!', {type:a.argon2id}).then(console.log)"
```

Luego inserte el usuario y asigne el rol `ADMIN` por nombre:

```sql
INSERT INTO users (
  cedula, nombres, apellidos, fecha_nacimiento, username, email, telefono,
  password, estado, token_version, version
) VALUES (
  '1712345678', 'Administrador', 'Principal', '1990-01-01',
  'admin', 'admin@example.com', '0999999999',
  '<HASH_ARGON2>', true, 0, 1
)
RETURNING id;

INSERT INTO user_roles (user_id, role_id, estado, version)
SELECT '<USER_ID>', id, true, 1
FROM roles
WHERE rol = 'ADMIN';
```

Después de eso puede iniciar sesión en `POST /api/v1/auth/login` y usar los
endpoints de administración para ingresar el resto de los datos.
