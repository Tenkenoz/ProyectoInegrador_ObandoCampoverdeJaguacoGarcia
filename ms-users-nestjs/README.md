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
