# STEGO

Microservicio NestJS independiente, administrado con pnpm, con PostgreSQL propio.
Includes validated configuration, migrations, health, Swagger and the STEGO pipeline.
Authentication and authorization are implemented; see [Security](docs/SECURITY.md).
Authorized image upload validation is implemented; see [Image uploads](docs/UPLOADS.md).
Statistical LSB detection is implemented; see [LSB technique](docs/TECNICA_LSB.md).
Persistent results, applied policies, private quarantine and audit are implemented;
see [Results and storage](docs/RESULTS_STORAGE.md).

## Requisitos

- Node.js 22 o superior y pnpm 11.12.0.
- PostgreSQL 17 o superior, o Docker para ejecutar la base de datos.

Todos los comandos siguientes parten de `ms-stego/`.

## Configuración

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`; por defecto `development`. |
| `PORT` | Puerto HTTP; por defecto `3002`. |
| `DB_HOST` | Host de PostgreSQL; por defecto `127.0.0.1`. |
| `DB_PORT` | Puerto de PostgreSQL; por defecto `5433`. |
| `DB_USERNAME` | Usuario exclusivo de STEGO, obligatorio. |
| `DB_PASSWORD` | Contraseña de PostgreSQL, obligatoria. |
| `DB_DATABASE` | Base de datos exclusiva de STEGO, obligatoria. |

La aplicación y el CLI de migraciones leen `.env`; las variables del entorno tienen
prioridad. El arranque falla si faltan credenciales o la configuración es inválida.
Los mensajes de validación muestran los nombres de las variables, no sus valores.
Los puertos deben ser enteros entre 1 y 65535.

Los valores de `.env.example` son únicamente para desarrollo local. Cambie la
contraseña tanto en PostgreSQL como en `.env` antes de usar otro entorno.
No reutilice credenciales ni tablas de AUTH.

## PostgreSQL local

Ejemplo compatible con `.env.example`:

```bash
docker network create stego-local
docker volume create stego-local-data
docker run -d --name stego-db --network stego-local \
  -p 127.0.0.1:5433:5432 \
  -e POSTGRES_USER=stego \
  -e POSTGRES_PASSWORD=change-me-local-only \
  -e POSTGRES_DB=stego \
  -v stego-local-data:/var/lib/postgresql/data \
  postgres:17-alpine
```

Espere a que `docker exec stego-db pg_isready -U stego -d stego` indique que
PostgreSQL acepta conexiones. Si usa una instancia existente, omita este paso y
configure su conexión en `.env`.

## Migraciones

```bash
pnpm migration:run
pnpm migration:show
```

Las migraciones son explícitas: `synchronize` y `migrationsRun` están desactivados.
La inicial crea `analyses` y un índice por solicitante y fecha. Incluye identificador,
UUID del usuario, nombre del archivo, SHA-256, técnica, indicadores JSON, fecha,
clasificación y política. La referencia al usuario es externa: no hay claves foráneas
ni conexiones hacia la base de datos de AUTH. El historial se guarda en
`stego_migrations`.

Para desarrollo, puede revertir la última migración con `pnpm migration:revert`.
La reversión inicial elimina la tabla y sus datos. Para generar otra migración:

```bash
pnpm migration:generate src/database/migrations/NombreDelCambio
```

## Ejecutar

```bash
pnpm start:dev
```

Para producción:

```bash
pnpm build
pnpm start:prod
```

The application requires PostgreSQL, a valid AUTH service secret and a readable
AUTH CA certificate to start. Configure the AUTH variables in `.env` as described
in [Security](docs/SECURITY.md).

La aplicación debe poder conectarse a PostgreSQL para iniciar. Las migraciones se
ejecutan por separado antes de habilitar las operaciones de análisis.

| Ruta | Uso |
| --- | --- |
| `GET /api/v1/health` | `200` si PostgreSQL responde; `503` si falla la consulta. |
| `POST /api/v1/steganography/analyze` | Authorized PNG/BMP validation and statistical LSB analysis; see [LSB technique](docs/TECNICA_LSB.md). |
| `GET /api/v1/steganography/results/:id` | Persisted result with current authorization and ownership checks. |
| `/docs` | Interfaz Swagger. |
| `/docs-json` | Documento OpenAPI JSON de las rutas implementadas. |

```bash
curl --fail http://localhost:3002/api/v1/health
```

Respuesta de salud: `{"status":"ok","service":"stego","database":"up"}`.
Este endpoint público comprueba conectividad, sin mostrar credenciales ni errores
internos. La ruta inicial `GET /` del generador se reemplazó por salud.

## Contenedor de STEGO

```bash
docker build -t ms-stego:local .
```

Con PostgreSQL del ejemplo, ejecute primero las migraciones desde el mismo artefacto:

```bash
docker run --rm --network stego-local --env-file .env \
  -e DB_HOST=stego-db -e DB_PORT=5432 \
  ms-stego:local \
  node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

Create the persistent quarantine volume and start STEGO:

```bash
docker volume create stego-quarantine
```

```bash
docker run -d --name stego --network stego-local --env-file .env \
  -e DB_HOST=stego-db -e DB_PORT=5432 \
  --mount type=volume,src=stego-quarantine,dst=/app/storage/quarantine \
  --mount type=bind,src="$(pwd)/certs/auth-ca.pem",dst=/run/certs/auth-ca.pem,readonly \
  -p 127.0.0.1:3002:3002 ms-stego:local
```

La imagen usa Node.js 24, compilación por etapas, dependencias de producción y un
usuario sin privilegios. No incluye `.env`, pruebas ni archivos locales. Incorpora
un healthcheck contra `/api/v1/health`. Si cambia `PORT`, ajuste el mapeo del puerto.

El Docker Compose general corresponde a la integración del equipo; este servicio
aporta su Dockerfile y las variables necesarias para incorporarlo.

## Verificación

```bash
pnpm lint
pnpm test
pnpm test:e2e
```

Unit tests cover configuration, health, cryptography, upload validation, LSB logic,
policies and storage. HTTP tests verify the security boundary and processing against
an HTTPS AUTH fixture with real RSA keys; these use in-memory persistence.
`pnpm test:integration` verifies real migrations, transactions, ownership, retention
and recovery against isolated PostgreSQL Docker containers.

Security tests require OpenSSL and include an HTTPS AUTH fixture. See
[Security verification](docs/SECURITY.md#verification-and-integration-limits) for
the current coverage and pending joint integration.

Upload limits and supported PNG/BMP encodings are described in [Image uploads](docs/UPLOADS.md).
Detection, classifications and limitations are described in [LSB technique](docs/TECNICA_LSB.md).
Run `pnpm samples:generate` to reproduce the committed [samples](samples/README.md).

The retention migration also creates `audit_events` and preserves legacy rows.
Run `pnpm test:integration` for isolated Docker/PostgreSQL tests and
`pnpm quarantine:cleanup` for manual retention maintenance. Configuration, failure
behavior and volume setup are documented in [Results and storage](docs/RESULTS_STORAGE.md).

## Delivery and rehearsal

```bash
pnpm openapi:export
pnpm evidence:generate
```

These commands require Docker and OpenSSL and run against isolated local fixtures.
They export [OpenAPI YAML](docs/openapi/stego.yaml) and generate [local evidence](docs/evidence/README.md),
without connecting to the team's AUTH or modifying Postman. See the
[delivery checklist](docs/DELIVERY.md) for pending dependencies and the
[demonstration guide](docs/DEMONSTRATION.md) for the rehearsal sequence.
Postman collection work and final screenshots remain pending the Postman MCP connection.
