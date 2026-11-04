# AUTH — Autenticación, autorización y auditoría

Este documento describe el microservicio `ms-users-nestjs` (AUTH) y el contrato
que consume STEGO. La fuente de verdad de la integración es
[`../../CONTRATO_AUTH_STEGO.md`](../../CONTRATO_AUTH_STEGO.md).

## 1. Responsabilidad y límites

AUTH administra:

- identidades de usuario;
- credenciales con Argon2id;
- roles y asignaciones usuario-rol;
- emisión y verificación de JWT RS256;
- publicación de claves públicas en JWKS;
- decisiones de autorización para STEGO;
- auditoría de eventos de seguridad.

AUTH no ejecuta análisis esteganográfico ni accede a la base de datos de STEGO.
STEGO no accede a las tablas de AUTH ni recibe la clave privada de firma.

```text
Cliente
  │
  ├── HTTPS ──> AUTH ──> auth-db
  │               │
  │               └── JWKS público
  │
  └── HTTPS ──> STEGO ──> stego-db
                    │
                    └── POST /internal/authorization/check (HMAC)
                              │
                              └── AUTH
```

## 2. Modelo de identidad

### 2.1 Usuarios

Tabla `users`:

- `id` UUID.
- `cedula`, `nombres`, `apellidos`, `fecha_nacimiento`.
- `username`, `email`, `telefono`, todos únicos.
- `password` almacena únicamente el hash Argon2id.
- `estado` y `fecha_eliminacion` permiten desactivación y eliminación lógica.
- `token_version` se incrementa al cerrar sesión.

### 2.2 Roles

Solo existen tres roles:

```text
ADMIN
ANALYST
USER
```

La migración idempotente los inserta y un `CHECK` de PostgreSQL impide crear
cualquier otro valor. El DTO de creación/edición también rechaza nombres fuera
del catálogo.

### 2.3 Relación N:M

```text
users 1 ─── N user_roles N ─── 1 roles
```

`user_roles` tiene:

- `id` UUID propio;
- `user_id` FK a `users` con `ON DELETE CASCADE`;
- `role_id` FK a `roles` con `ON DELETE CASCADE`;
- índice único `(user_id, role_id)`;
- `estado`, `version`, `fecha_asignacion` y `fecha_actualizacion`.

Una asignación activa repetida devuelve `409`. Una asignación revocada se
reactiva con el mismo `id`, sin crear una fila duplicada.

## 3. Contraseñas

Todas las rutas de creación, actualización y login usan `PasswordHasher` con
Argon2id y estos parámetros:

```text
memoryCost: 19456 KiB
timeCost: 2
parallelism: 1
```

El login ejecuta una verificación contra un hash ficticio cuando el usuario no
existe, reduciendo diferencias de tiempo. Nunca se devuelve el hash.

## 4. JWT

### 4.1 Algoritmo y claves

- Algoritmo exclusivo: `RS256`.
- Clave RSA mínima: 2048 bits.
- La clave privada permanece en AUTH y nunca se versiona.
- La clave pública se publica en JWKS.
- `kid` identifica la clave en la cabecera JWT.

Generación local:

```bash
cd ms-users-nestjs
pnpm keys:generate
```

El comando crea `keys/jwt-private.pem` y `keys/jwt-public.pem`. La carpeta
`keys/` está excluida por `.gitignore`.

Variables:

```dotenv
JWT_PRIVATE_KEY_PATH=keys/jwt-private.pem
JWT_PUBLIC_KEY_PATH=keys/jwt-public.pem
JWT_KEY_ID=<kid>
JWT_ISSUER=secure-chat-auth
JWT_AUDIENCE=secure-chat-api
JWT_EXPIRES_IN_SECONDS=900
JWT_CLOCK_TOLERANCE_SECONDS=5
```

### 4.2 Claims

Payload emitido:

```json
{
  "sub": "<uuid>",
  "username": "<username>",
  "tokenVersion": 0,
  "typ": "access",
  "iat": 1790000000,
  "exp": 1790000900,
  "iss": "secure-chat-auth",
  "aud": "secure-chat-api"
}
```

Cabecera:

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "<kid>"
}
```

AUTH verifica firma, algoritmo, `iss`, `aud`, expiración y `typ=access`. Los
roles **no** viajan dentro del JWT: se leen de PostgreSQL en cada solicitud.

### 4.3 JWKS

```http
GET /.well-known/jwks.json
```

Ruta pública, fuera de `/api/v1`. Devuelve únicamente:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "<kid>",
      "n": "<modulus>",
      "e": "<exponent>"
    }
  ]
}
```

No contiene `d`, `p`, `q` ni material privado.

## 5. Roles y permisos

### 5.1 Endpoints de AUTH

| Endpoint | ADMIN | ANALYST | USER |
| --- | --- | --- | --- |
| `POST /api/v1/auth/login` | Público | Público | Público |
| `GET /api/v1/auth/profile` | Sí | Sí | Sí, solo el propio |
| `GET /api/v1/auth/me` | Sí | Sí | Sí, solo el propio |
| `POST /api/v1/auth/logout` | Sí | Sí | Sí |
| `/api/v1/users*` | Sí | No | No |
| `/api/v1/roles*` | Sí | No | No |
| `/api/v1/user-roles*` | Sí | No | No |
| `GET /api/v1/audit-events` | Sí | No | No |

Los endpoints de administración exigen `ADMIN`. Cualquier usuario autenticado
puede consultar únicamente su propio perfil.

### 5.2 Acciones de STEGO

| Rol | `steganography.analyze` | `steganography.results.read` |
| --- | --- | --- |
| `ADMIN` | Sí, `scope: any` | Sí, `scope: any` |
| `ANALYST` | Sí, `scope: own` | Sí, `scope: own` |
| `USER` | No | No |

Si un usuario acumula roles, prevalece el mayor alcance: `ADMIN` + `ANALYST`
produce `any`.

La política se implementa en `AuthorizationPolicyService`.

## 6. Revocación

### 6.1 Retiro de rol

Cada solicitud ejecuta una consulta a `users`, `user_roles` y `roles`. Retirar
o desactivar una asignación impide la siguiente operación aunque el JWT siga
vigente.

Prueba T07:

1. El usuario accede a un endpoint `ADMIN`.
2. Se retira su rol `ADMIN`.
3. Se reutiliza el mismo JWT.
4. La siguiente operación devuelve `403`.

### 6.2 Logout

`POST /api/v1/auth/logout` incrementa `token_version` en PostgreSQL. La
estrategia JWT compara el claim `tokenVersion` con el valor actual y devuelve
`401` para tokens anteriores.

## 7. Endpoint interno AUTH–STEGO

```http
POST /internal/authorization/check
Content-Type: application/json
```

Ruta fuera de `/api/v1`, protegida por HMAC de servicio, no por JWT de usuario.

### 7.1 Cabeceras

```text
X-Service-Id: stego
X-Service-Timestamp: <segundos Unix>
X-Service-Nonce: <32 bytes aleatorios en 64 hex>
X-Service-Signature: <HMAC-SHA256 en 64 hex minúsculas>
```

### 7.2 Firma

Entrada UTF-8, separada por LF, sin salto final:

```text
stego
POST
/internal/authorization/check
<timestamp>
<nonce>
<sha256 del cuerpo exacto en hex>
```

La clave es `AUTH_SERVICE_SECRET`, un secreto de 32 bytes expresado como 64
caracteres hexadecimales. AUTH compara en tiempo constante.

### 7.3 Protección contra repetición

- Ventana de timestamp: ±30 segundos.
- Nonce aceptado una sola vez.
- Retención: 60 segundos.
- Caché acotada: `AUTH_HMAC_NONCE_CACHE_SIZE`.
- Si la caché se llena, se responde `503` y no se eliminan nonces vigentes.
- La caché es en memoria; con varias réplicas se requiere almacenamiento
  compartido.

### 7.4 Solicitud

```json
{
  "subject_token": "<JWT_DEL_USUARIO>",
  "action": "steganography.analyze",
  "resource_id": null
}
```

Para leer resultados:

```json
{
  "subject_token": "<JWT_DEL_USUARIO>",
  "action": "steganography.results.read",
  "resource_id": "<UUID_ANALISIS>"
}
```

### 7.5 Decisión válida

Permitida:

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

Denegada por permisos, siempre con HTTP `200`:

```json
{
  "subject_id": "<uuid>",
  "action": "steganography.analyze",
  "resource_id": null,
  "allowed": false,
  "scope": null,
  "reason": "insufficient_permissions"
}
```

### 7.6 Errores internos

| HTTP | `code` |
| --- | --- |
| `400` | `invalid_authorization_request` |
| `401` | `invalid_service_credentials` |
| `401` | `invalid_subject_token` |
| `401` | `subject_inactive` |
| `401` | `session_revoked` |
| `503` | `authorization_unavailable` |

Los errores internos usan únicamente:

```json
{
  "code": "session_revoked",
  "message": "Subject session is no longer valid"
}
```

## 8. Auditoría

Tabla `audit_events`:

- `occurred_at`
- `event_type`
- `actor_id`
- `subject_id`
- `action`
- `resource_id`
- `decision`
- `reason`
- `request_id`

Eventos:

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

No se almacenan contraseñas, JWT completos, `subject_token`, secretos HMAC,
firmas ni cuerpos sensibles. La escritura de auditoría es best-effort: un fallo
de auditoría no bloquea la operación de seguridad y se registra como advertencia.

Consulta de T12:

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

## 9. Variables de entorno

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:3000

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USERNAME=user_app
DB_PASSWORD=<password>
DB_DATABASE=user_db
DB_SSL=false

JWT_PRIVATE_KEY_PATH=keys/jwt-private.pem
JWT_PUBLIC_KEY_PATH=keys/jwt-public.pem
JWT_KEY_ID=<kid>
JWT_ISSUER=secure-chat-auth
JWT_AUDIENCE=secure-chat-api
JWT_EXPIRES_IN_SECONDS=900
JWT_CLOCK_TOLERANCE_SECONDS=5

AUTH_SERVICE_ID=stego
AUTH_SERVICE_SECRET=<64 hex>
AUTH_HMAC_CLOCK_SKEW_SECONDS=30
AUTH_HMAC_NONCE_TTL_SECONDS=60
AUTH_HMAC_NONCE_CACHE_SIZE=10000
```

No se versionan `.env`, claves privadas, certificados privados ni secretos HMAC.

## 10. Ejecución local

```bash
cd ms-users-nestjs
pnpm install --frozen-lockfile
pnpm keys:generate
cp example.env.dist .env
# completar DB_*, JWT_KEY_ID y AUTH_SERVICE_SECRET
docker compose up -d --wait
pnpm migration:run
pnpm start:dev
```

Con Podman se puede usar el mismo contenedor de PostgreSQL y ejecutar las
migraciones con las variables `DB_*` correspondientes.

## 11. Pruebas

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
pnpm openapi:check
RUN_DB_TESTS=true \
DB_HOST=127.0.0.1 \
DB_PORT=55432 \
DB_USERNAME=user_app \
DB_PASSWORD='<password>' \
DB_DATABASE=auth_test \
pnpm test:integration
```

El contrato OpenAPI se encuentra en
[`docs/openapi/auth.yaml`](openapi/auth.yaml).

Cobertura de aceptación:

- **T02:** login válido/inválido, JWT RS256 y perfil.
- **T05:** dos roles a un usuario y un rol a dos usuarios.
- **T06:** asignación duplicada `409`, sin fila duplicada.
- **T07:** retiro de rol con JWT vigente y logout con `tokenVersion`.
- **T12:** auditoría redactada y consulta solo para `ADMIN`.

La colección Postman está en
[`../postman/AUTH.postman_collection.json`](../postman/AUTH.postman_collection.json)
y las instrucciones en [`../postman/README.md`](../postman/README.md).

## 12. Limitaciones conocidas

- La caché de nonces es local a una instancia.
- La rotación de claves JWT no está automatizada; el contrato admite publicar
  varias claves públicas, pero la entrega usa una clave activa.
- La auditoría es best-effort para no bloquear operaciones si falla su escritura.
- No se implementan refresh tokens; el access token dura 900 segundos.
- El perfil devuelve los campos de dominio existentes para no romper el contrato
  HTTP y la base de datos.

## 13. Referencias

- [RFC 8725: JWT Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html)
- [RFC 7517: JSON Web Key (JWK)](https://www.rfc-editor.org/rfc/rfc7517.html)
- [RFC 7519: JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519.html)
- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)
- [`../../CONTRATO_AUTH_STEGO.md`](../../CONTRATO_AUTH_STEGO.md)
