# Ejecución e integración

Guía operativa del despliegue AUTH–STEGO: cómo levantar el stack, verificar
cada prueba T01–T12 y reproducir la evidencia.

## 1. Requisitos

| Herramienta | Versión usada |
| --- | --- |
| Docker | `29.7.2` |
| Docker Compose | `5.4.0` |
| Node.js | `v24.22.0` |
| OpenSSL | `3.0.13` |
| pnpm | `11.26.0` (en las imágenes Docker) |

## 2. Servicios, puertos y redes

| Servicio | Rol | Puerto host | Consumidor |
| --- | --- | --- | --- |
| `auth` | nginx HTTPS (TLS), DNS `auth` | `127.0.0.1:3001` | STEGO y clientes |
| `auth-api` | NestJS AUTH (HTTP interno) | — | `auth` |
| `auth-db` | PostgreSQL de AUTH | — | solo AUTH |
| `stego` | NestJS STEGO (HTTP interno) | `127.0.0.1:3002` | `edge`, `stego-db` |
| `stego-db` | PostgreSQL de STEGO | — | solo STEGO |
| `edge` | nginx HTTPS para clientes | `127.0.0.1:8443` | navegador/Postman |

Herramientas opcionales (perfiles):

| Servicio | Uso |
| --- | --- |
| `migrate` | Migraciones de AUTH (`--profile tools`) |
| `stego-migrate` | Migraciones de STEGO (`--profile tools`) |
| `seed` | Seed demo (`--profile seed`) |

Redes:

- `auth-net`: `auth`, `auth-db`.
- `stego-net`: `stego`, `stego-db`, `edge`.
- `integration-net`: únicamente `auth`, `stego`.

El puente `integration-net` es el único camino entre los dos servicios. Las
bases de datos nunca son alcanzables por el otro servicio.

## 3. Preparación

```bash
# 1. Entorno local (nunca se sube a Git)
cp .env.example .env
# Edita: contraseñas de ambas bases, AUTH_SERVICE_SECRET (openssl rand -hex 32)
#        y SEED_DEFAULT_PASSWORD (mínimo 12 caracteres)

# 2. CA y certificados locales para "auth" y "edge"
bash scripts/gen-certs.sh
openssl verify -CAfile docker/certs/auth-ca.pem docker/certs/auth.crt docker/certs/edge.crt

# 3. Claves JWT de AUTH
node ms-users-nestjs/scripts/generate-jwt-keys.mjs
```

El script de claves admite flags para no sobrescribir material existente:

```bash
node scripts/forge-token.mjs --help
```

### Alternativas para el JWT local

`scripts/forge-token.mjs` firma tokens con la clave local para ejercicios
negativos. Ejemplos:

```bash
# Token vencido para T03
TOKEN=$(node scripts/forge-token.mjs --sub <uuid> --username analyst.one --token-version 1 --expired)

# Emisor, audiencia, tipo o kid incorrectos
node scripts/forge-token.mjs --sub <uuid> --issuer attacker
node scripts/forge-token.mjs --sub <uuid> --audience other-api
node scripts/forge-token.mjs --sub <uuid> --typ refresh
node scripts/forge-token.mjs --sub <uuid> --kid unknown-key
node scripts/forge-token.mjs --sub <uuid> --algorithm none
```

El script solo imprime el token. La clave privada nunca sale de
`ms-users-nestjs/keys/`.

## 4. Levantar el stack

```bash
docker compose build
docker compose up -d --wait

docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm stego-migrate
docker compose --profile seed run --rm seed
```

### Verificación rápida

```bash
export NODE_EXTRA_CA_CERTS=docker/certs/auth-ca.pem

curl -sS $NODE_EXTRA_CA_CERTS \
  --cacert docker/certs/auth-ca.pem https://localhost:3001/api/v1/health

curl -sS --cacert docker/certs/auth-ca.pem https://localhost:8443/api/v1/health

curl -sS --cacert docker/certs/auth-ca.pem \
  https://localhost:3001/.well-known/jwks.json | python3 -m json.tool
```

## 5. Login y uso de curl

El token dura 15 minutos. Guárdalo en una variable y reutilízalo con `curl`
y con `jq` si está instalado:

```bash
TOKEN=$(curl -sS --cacert docker/certs/auth-ca.pem \
  -X POST https://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"analyst.one","password":"DemoSeguro2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

curl -sS --cacert docker/certs/auth-ca.pem \
  https://localhost:3001/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN"
```

Para análisis:

```bash
curl -sS -X POST https://localhost:8443/api/v1/steganography/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@ms-stego/samples/lsb-payload.png
```

> Desde la raíz, las rutas de archivos deben incluir el prefijo `ms-stego/`
> porque Postman se ejecuta con `--working-dir .` para que los fixtures
> `samples/` y `postman/files/` sean relativos al repositorio.

## 6. Postman

La colección unificada contiene **101 solicitudes en 22 carpetas**:

- `AUTH · 00` … `AUTH · 09`: colección original de Jonathan (T02, T05, T06,
  T07, T12, HMAC interno, logout y controles negativos).
- `AUTH · 10`: rutas administrativas no presentes en la exportación original
  (CRUD de usuarios, roles y asignaciones, `/auth/me`).
- `AUTH · 99`: limpieza de los usuarios desechables de las carpetas de
  preparación.
- `STEGO · 00` … `STEGO · 08`: colección original de Mateo (T03, T09, T10,
  T11, T12, persistencia y retención).
- `11 - Integración AUTH–STEGO`: flujo completo contra ambas APIs con los
  usuarios del seed.

### Importar

1. Importar `postman/PROYECTO.postman_collection.json`.
2. Importar y seleccionar `postman/PROYECTO.postman_environment.json`.
3. Confirmar los valores:

| Variable | Valor |
| --- | --- |
| `baseUrl` | `https://localhost:3001` |
| `stego_origin` | `https://localhost:8443` |
| `adminPassword`, `analystonePassword`, `analysttwoPassword`, `userstandardPassword`, `userPassword` | Contraseña del seed |
| `authServiceSecret` | Valor de `.env`, 64 caracteres hexadecimales |

El entorno tiene `authServiceSecret` como placeholder. Copia el valor de
`.env` solo en tu entorno local; no lo subas a Git.

### Ejecutar con Newman

```bash
export NODE_EXTRA_CA_CERTS=docker/certs/auth-ca.pem
SECRET=$(grep '^AUTH_SERVICE_SECRET=' .env | cut -d= -f2)

npx --yes newman run postman/PROYECTO.postman_collection.json \
  -e postman/PROYECTO.postman_environment.json \
  --env-var "authServiceSecret=$SECRET" \
  --folder 'AUTH · 00 - Health and JWKS' \
  --folder 'AUTH · 01 - T02 Authentication' \
  --folder 'AUTH · 02 - Setup users and roles' \
  --folder 'AUTH · 03 - T05 N:M assignments' \
  --folder 'AUTH · 04 - T06 Duplicate assignment' \
  --folder 'AUTH · 05 - T07 Revocation' \
  --folder 'AUTH · 06 - Internal authorization (HMAC)' \
  --folder 'AUTH · 07 - T12 Audit' \
  --folder 'AUTH · 08 - Logout' \
  --folder 'AUTH · 09 - Negative checks' \
  --folder 'AUTH · 10 - Rutas administrativas completas' \
  --folder 'AUTH · 99 - Limpieza de usuarios desechables' \
  --working-dir .
```

Para las carpetas de STEGO, antes de ejecutar crea los fixtures locales:

```bash
node ms-stego/scripts/postman/prepare-files.mjs
```

Y pasa los tokens reales. La colección guarda los tokens en el entorno, no
en variables de colección, porque el entorno tiene precedencia.

### Casos manuales

Los casos marcados como manuales (`auth_unavailable_confirmed`,
`role_revoked_confirmed`, `retention_cleanup_confirmed`) se omiten hasta
preparar la condición. En T08 hay que detener `auth` y `auth-api`; si solo
se detiene `auth`, nginx puede responder `502` en lugar del `503` de STEGO.

## 7. Matriz de pruebas

| ID | Qué se comprueba | Carpetas Postman | Respuesta clave | Evidencia |
| --- | --- | --- | --- | --- |
| T01 | Salud, TLS, JWKS, redes | `AUTH · 00`, `STEGO · 00`, `11` | `200` | `evidencias/T01/` |
| T02 | Login válido/inválido, perfil, claims | `AUTH · 01` | `200/401` | `evidencias/T02/` |
| T03 | JWT válido, ausente, malformado, manipulado, vencido, claims, `kid`, `none` | `STEGO · 01`, `11` | `401` | `evidencias/T03/` |
| T04 | `USER` no puede analizar | `11` | `403` | `evidencias/T04/` |
| T05 | N:M, un rol para dos usuarios y dos roles para un usuario | `AUTH · 02`, `AUTH · 03`, `AUTH · 10` | `201/200` | `evidencias/T05/` |
| T06 | Asignación duplicada | `AUTH · 04` | `409` | `evidencias/T06/` |
| T07 | Retiro de rol con el mismo JWT | `AUTH · 05`, `11` | `403 → 200` | `evidencias/T07/` |
| T08 | AUTH caído: `503`, sin análisis | `11` | `503` | `evidencias/T08/` |
| T09 | LSB, PNG/BMP, ruido y casos no concluyentes | `STEGO · 02`, `11` | `200 sospechoso/no_concluyente` | `evidencias/T09/` |
| T10 | Corrupto, falso, oversized, vacío, MIME y JSON | `STEGO · 03`, `11` | `400/415/413` | `evidencias/T10/` |
| T11 | Propio, ajeno, ADMIN, USER y `404` | `STEGO · 04`, `11` | `200/403/404` | `evidencias/T11/` |
| T12 | Auditoría y correlación `X-Request-Id` | `AUTH · 07`, `STEGO · 08`, `11` | `200/403` | `evidencias/T12/` |

### Roles y alcance

| Rol | `steganography.analyze` | `steganography.results.read` |
| --- | --- | --- |
| `ADMIN` | Sí | Todos (`any`) |
| `ANALYST` | Sí | Propios (`own`) |
| `USER` | No | No |
| `ADMIN` + `ANALYST` | Sí | Todos (`any`) |

STEGO consulta AUTH en cada operación. Retirar un rol, desactivar un usuario
o hacer logout afecta la siguiente solicitud aunque el JWT siga vigente.

## 8. Generar la evidencia

```bash
NODE_EXTRA_CA_CERTS=docker/certs/auth-ca.pem node scripts/capture-evidence.mjs
```

El script:

1. Verifica el despliegue y el certificado.
2. Ejecuta los casos T01–T12 contra los servicios reales.
3. Detiene y reinicia AUTH para T08.
4. Depura JWT, contraseñas y secretos de todas las capturas.
5. Escribe `docs/evidencias/<Txx>/capture.md` y `capture.json`.

`docs/evidencias/` está ignorado por Git: el paquete de evidencia se entrega
fuera del repositorio.

## 9. Cerrar el stack

```bash
docker compose down
```

No se borran los volúmenes (`auth-db-data`, `stego-db-data`,
`stego-quarantine`). Para empezar de cero:

```bash
docker compose down -v
```
