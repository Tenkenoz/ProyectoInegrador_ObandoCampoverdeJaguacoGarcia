# Microservicio de Autenticación

## Requisitos

- Node.js 22 o superior
- pnpm 11.12.0
- Docker y Docker Compose
- Una copia de `.env` basada en `example.env.dist`

```bash
cp example.env.dist .env
```

Ajuste `DB_PASSWORD` y `JWT_SECRET` en `.env` antes de continuar.

## Instalación

```bash
pnpm install --frozen-lockfile
```

## Base de datos

```bash
docker compose up -d --wait
pnpm migration:run
```

`migration:run` crea las tablas `users`, `roles` y `user_roles`. No hay seeder:
los datos se ingresan después mediante la API o directamente en PostgreSQL.

## Ejecutar la aplicación

```bash
pnpm start:dev
```

Para producción:

```bash
pnpm build
pnpm start:prod
```

## Acceso

- API: `http://localhost:3001/api/v1`
- Health: `http://localhost:3001/api/v1/health`
- Swagger: `http://localhost:3001/docs`

## Insertar el primer administrador

El primer usuario con rol `ADMIN` debe insertarse manualmente. Genere el hash de
la contraseña con Argon2:

```bash
node -e "const a=require('argon2'); a.hash('TuClaveSegura2026!', {type:a.argon2id}).then(console.log)"
```

Luego inserte el rol, el usuario y la asignación (reemplace los UUID y el hash):

```sql
INSERT INTO roles (rol, estado, version)
VALUES ('ADMIN', true, 1)
RETURNING id;

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
VALUES ('<USER_ID>', '<ROLE_ID>', true, 1);
```

Después de eso puede iniciar sesión en `POST /api/v1/auth/login` y usar los
endpoints de administración para ingresar el resto de los datos.
