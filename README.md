# Proyecto Integrador

Monorepo de microservicios NestJS con pnpm Workspaces y Nx.

| Proyecto Nx | Carpeta | Función |
| --- | --- | --- |
| `ms-users-nestjs` | `ms-users-nestjs/` | Usuarios y autenticación (`user-service` en pnpm) |
| `ms-stego` | `ms-stego/` | Análisis de esteganografía |

Requiere Node.js >=22 y pnpm 11.12.0. Desde la raíz:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
pnpm dev
```

Antes de iniciar los servicios, configure sus archivos `.env`, bases de datos y
migraciones siguiendo [usuarios](ms-users-nestjs/README.md) y
[esteganografía](ms-stego/README.md). `pnpm dev` inicia ambos servicios en modo watch;
no inicia PostgreSQL ni ejecuta migraciones automáticamente.

Para ejecutar un solo servicio o cualquiera de sus scripts mediante Nx:

```sh
pnpm nx build ms-users-nestjs
pnpm nx run ms-stego:start:dev
pnpm nx run ms-users-nestjs:migration:run
pnpm nx run ms-stego:test:e2e
pnpm nx run ms-stego:test:integration
pnpm nx show projects
pnpm graph
```

`pnpm test` ejecuta las pruebas disponibles: actualmente solo `ms-stego` tiene un
target `test`. Las pruebas de integración y e2e se ejecutan explícitamente y pueden
requerir PostgreSQL o Docker; consulte el README del servicio.

Nx descubre los scripts de cada paquete. Los nombres Nx están definidos en sus
`project.json`; el nombre pnpm del servicio de usuarios continúa siendo
`user-service`. También puede usar `pnpm --filter user-service build`.

La instalación del monorepo usa `pnpm-workspace.yaml` y `pnpm-lock.yaml` de la raíz.
Los archivos pnpm existentes dentro de cada servicio se conservan para los flujos
independientes existentes, incluido el contexto Docker de `ms-stego`; no representan
el lockfile del monorepo. Para el desarrollo del monorepo instale siempre desde la raíz.

Nx guarda en `.nx/` los resultados de compilación y lint. Las pruebas, migraciones,
generación de archivos y tareas de despliegue no tienen caché habilitada. La caché
de build restaura `dist/` y el archivo incremental de TypeScript de cada servicio.
Para forzar una ejecución use `--skip-nx-cache`.

Para verificar solo proyectos afectados por cambios respecto a una referencia Git:

```sh
pnpm affected --base=main --head=HEAD
```

La configuración sigue la [integración oficial de Nx con pnpm Workspaces](https://nx.dev/docs/kb/pnpm-workspaces).

## Contrato de integración AUTH–STEGO

AUTH administra identidades, sesiones y roles. STEGO valida imágenes, ejecuta
análisis LSB y conserva sus resultados en una base de datos independiente.
Ambos servicios mantienen procesos, configuración y despliegues autónomos; la
única conexión entre ellos es `integration-net`.

### Autenticación y autorización vigentes

| Elemento | Valor implementado |
| --- | --- |
| JWT | RS256, clave RSA de 2048 bits mínimo, 900 segundos |
| `iss` | `secure-chat-auth` |
| `aud` | `secure-chat-api` |
| `sub` | UUID del usuario |
| Payload | `typ: "access"`, `tokenVersion`, `iat`, `exp` |
| Cabecera | `kid` obligatorio |
| Claves públicas | `GET /.well-known/jwks.json` en AUTH |
| Tolerancia de reloj | 5 segundos |

La clave privada permanece exclusivamente en AUTH. JWKS solo publica material
público. Los roles del JWT o enviados por el cliente no forman parte de la
decisión de autorización.

STEGO verifica el JWT contra JWKS y consulta a AUTH en cada operación:

```http
POST /internal/authorization/check
Content-Type: application/json
```

Acciones admitidas:

| Acción | `resource_id` | Uso |
| --- | --- | --- |
| `steganography.analyze` | `null` | Solicitar un análisis |
| `steganography.results.read` | UUID del análisis | Consultar un resultado |

AUTH responde `200` para permitir y para denegar por permisos:

```json
{
  "subject_id": "<UUID_USUARIO>",
  "action": "steganography.results.read",
  "resource_id": "<UUID_ANALISIS>",
  "allowed": true,
  "scope": "own",
  "reason": "active_role_grants_permission"
}
```

| Rol | Analizar | Consultar resultados |
| --- | --- | --- |
| `ADMIN` | Sí | Todos, alcance `any` |
| `ANALYST` | Sí | Propios, alcance `own` |
| `USER` | No | No |

Si se acumulan roles, prevalece el mayor alcance. Retirar o desactivar un rol,
y el logout mediante `tokenVersion`, afecta la siguiente solicitud aunque el
JWT siga vigente.

### Autenticación HMAC entre servicios

La ruta interna usa HMAC-SHA256 con un secreto de 32 bytes codificado como 64
caracteres hexadecimales. Cabeceras:

```text
X-Service-Id: stego
X-Service-Timestamp: <segundos Unix en decimal>
X-Service-Nonce: <32 bytes aleatorios, 64 caracteres hexadecimales>
X-Service-Signature: <HMAC-SHA256 hexadecimal en minúsculas>
```

La firma se calcula sobre la secuencia UTF-8:

```text
stego
POST
/internal/authorization/check
<timestamp>
<nonce>
<SHA-256 hexadecimal del cuerpo exacto>
```

AUTH valida la firma antes de registrar el nonce y lo conserva 60 segundos.

### Canal seguro y despliegue

| Componente | Dirección |
| --- | --- |
| AUTH interno | `https://auth:3001` |
| STEGO interno | `http://stego:3002` |
| Borde HTTPS | `https://localhost:8443` |
| PostgreSQL de STEGO | `stego-db:5432` |
| Cuarentena | `/app/storage/quarantine` |

STEGO usa `AUTH_BASE_URL=https://auth:3001`,
`AUTH_JWKS_URL=https://auth:3001/.well-known/jwks.json`,
`AUTH_CA_CERT_PATH` para la CA local,
`AUTH_SERVICE_ID=stego`, `AUTH_SERVICE_SECRET` hex y
`AUTH_TIMEOUT_MS=3000`. El certificado de AUTH incluye el nombre DNS `auth`;
la CA no contiene claves privadas de AUTH.

### Orden de procesamiento y fallo seguro

En el análisis, STEGO:

1. Aplica límites de entrada y valida el JWT.
2. Consulta la autorización vigente a AUTH.
3. Recibe `multipart/form-data` y valida el archivo.
4. Analiza y aplica la política.
5. Persiste el resultado y registra auditoría.

Ante denegación o ausencia de decisión verificable, no ejecuta el detector ni
crea análisis.

Respuestas públicas representativas:

| Situación | HTTP |
| --- | --- |
| JWT ausente, manipulado, vencido o de tipo incorrecto | `401` |
| Sesión revocada o usuario desactivado | `401` |
| Usuario autenticado sin permiso | `403` |
| Resultado ajeno con alcance `own` | `403` |
| Resultado inexistente tras autorizar | `404` |
| AUTH inaccesible, timeout o respuesta inválida | `503` |

La auditoría depurada correlaciona eventos con el `X-Request-Id` y no guarda
JWT, `subject_token`, secretos HMAC, firmas reutilizables, claves privadas,
contraseñas ni contenido de imágenes.

### Ejecución

```bash
cp .env.example .env
bash scripts/gen-certs.sh
node ms-users-nestjs/scripts/generate-jwt-keys.mjs

docker compose build
docker compose up -d --wait
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm stego-migrate
docker compose --profile seed run --rm seed
```

La verificación completa T01–T12, la colección Postman y la presentación
están en [docs/EJECUCION.md](docs/EJECUCION.md),
[docs/SEED.md](docs/SEED.md) y
[docs/PRESENTACION.md](docs/PRESENTACION.md).
