# Presentación del Proyecto Integrador

Guion para la entrega y la demostración en vivo de AUTH–STEGO.

**Miro al equipo, no a la pantalla.** La idea principal es: *la autorización se
verifica en cada operación; retirar permisos funciona aunque el token siga
vigente.*

## Banner

> **AUTH–STEGO: autenticación y autorización en cada análisis de imagen**
> — JWT RS256, decisiones RBAC en tiempo real y cuarentena privada.

## Preparación (5 minutos antes)

```bash
docker compose build
docker compose up -d --wait

docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm stego-migrate
docker compose --profile seed run --rm seed

export NODE_EXTRA_CA_CERTS=docker/certs/auth-ca.pem
curl -sS --cacert docker/certs/auth-ca.pem https://localhost:3001/api/v1/health
curl -sS --cacert docker/certs/auth-ca.pem https://localhost:8443/api/v1/health
```

Detalles:

- El seed es manual y opcional; nunca se ejecuta solo.
- `pnpm` es `11.26.0` en todas las imágenes.
- Los tokens duran 15 minutos: volver a hacer login si expiran.
- La carpeta `docs/evidencias/<Txx>/` tiene capturas listas si algo falla en
  vivo.

## Sistema

- **AUTH** — identidad, sesión y roles. Emite JWT RS256 y pública JWKS.
- **STEGO** — validación y detección LSB chi-cuadrado, resultados y
  cuarentena privada.
- **Compose** — `auth`, `auth-api`, `auth-db`, `stego`, `stego-db`, `edge`.

Redes:

- `auth-net`: AUTH y su base.
- `stego-net`: STEGO, su base y el borde HTTPS.
- `integration-net`: solo el puente `auth` ↔ `stego`.

## Flujo (8 minutos)

1. **Login** — `analyst.one` recibe JWT RS256 de 900 segundos; se muestran
   `iss`, `aud`, `typ`, `kid` y `tokenVersion`, sin exponer la firma.
2. **Original** — `original.png` devuelve `sin_indicios` y una política de
   `advertencia`.
3. **Payload conocido** — `lsb-payload.png` devuelve `sospechoso`, política
   `cuarentena` y métricas concretas (p ≈ `0.797686`, `lsb_ratio` ≈
   `0.500834`).
4. **Falso positivo conocido** — el ruido sin carga también da `sospechoso`.
   Se reconoce explícitamente; no es una afirmación de contenido oculto.
5. **Propiedad** — `analyst.two` recibe `403` para el resultado de
   `analyst.one`; `admin` lo lee por el alcance `any`.
6. **Revocación** — se elimina la asignación ANALYST y el mismo JWT recibe
   `403`; al restaurarla vuelve a `200`.
7. **Caída de AUTH** — se detienen `auth` y `auth-api`; STEGO responde `503`
   y el conteo de `analyses` no cambia.
8. **T08 y auditoría** — se reinicia AUTH, el mismo JWT recupera acceso y se
   muestra el `X-Request-Id` correlacionado con la auditoría.

## Matriz T01–T12

| Prueba | Idea a comunicar | Evidencia |
| --- | --- | --- |
| T01 | Salud, TLS y JWKS | `evidencias/T01/` |
| T02 | Login y claims | `evidencias/T02/` |
| T03 | JWT ausente, manipulado, vencido, claims, `kid`, `none` | `evidencias/T03/` |
| T04 | `USER` no puede analizar | `evidencias/T04/` |
| T05 | Roles N:M | `evidencias/T05/` |
| T06 | Duplicado `409` | `evidencias/T06/` |
| T07 | Mismo JWT, `403`, restauración, `200` | `evidencias/T07/` |
| T08 | AUTH caído, `503`, sin análisis | `evidencias/T08/` |
| T09 | LSB en PNG/BMP, ruido y casos no concluyentes | `evidencias/T09/` |
| T10 | Validación y tamaños | `evidencias/T10/` |
| T11 | `own`, ajeno, `any`, `USER`, `404` | `evidencias/T11/` |
| T12 | Auditoría y correlación | `evidencias/T12/` |

## Roles

| Rol | Analizar | Leer resultados |
| --- | --- | --- |
| `ADMIN` | Sí | Todos (`any`) |
| `ANALYST` | Sí | Propios (`own`) |
| `USER` | No | No |
| `ADMIN` + `ANALYST` | Sí | Todos (`any`, prevalece el mayor alcance) |

## Seed

Usuarios del seed: `admin`, `analyst.one`, `analyst.two`, `user.standard`,
`dual.role`.

- Contraseña común del seed: `DemoSeguro2026!` (local, no usar en producción).
- `admin` → ADMIN; `user.standard` → USER; los analistas → ANALYST.
- `dual.role` demuestra la acumulación de roles.
- Las contraseñas se almacenan con Argon2id.
- Reejecutar el seed no duplica usuarios, asignaciones ni roles.

## Condiciones manuales de Postman

- `auth_unavailable_confirmed=true`: T08, con `auth` y `auth-api` detenidos.
- `role_revoked_confirmed=true`: T07 durante el retiro del rol.
- `retention_cleanup_confirmed=true`: retención y limpieza de cuarentena.
- `run_manual_cases=true`: casos de propiedad con tokens reales.

Sin la confirmación, esas solicitudes se omiten y no deberían tratarse como
fallos.

## Fallos esperados con un mensaje para cada caso

- **Sin JWT** — `401`. *No se pudo autenticar.*
- **JWT manipulado o vencido** — `401`. *No se acepta.*
- **USER analiza** — `403`. *Autenticado, pero sin permiso.*
- **Otro ANALYST lee** — `403`. *El alcance own exige propiedad.*
- **No existe el resultado** — `404`, solo para el usuario ya autorizado.
- **Mismo JWT tras revocar el rol** — `403`. *La autorización es vigente.*
- **AUTH detenido o inaccesible** — `503`. *Fallo seguro, sin análisis.*
- **Logout y reutilización** — `401`. *La sesión quedó invalidada.*

## Cierre

> **AUTH verifica la identidad y el permiso vigente en cada operación; STEGO
> solo procesa y conserva el análisis después de recibir una decisión válida.
> Retirar un rol o terminar la sesión surte efecto en la siguiente solicitud
> aunque el JWT no haya expirado, y si AUTH cae, STEGO falla seguro con 503.
> T01–T12 están verificados contra el despliegue real y documentados con
> capturas depuradas.**

Riesgos y límites:

- La clave JWKS y los certificados locales son de desarrollo; deben rotarse
  fuera de esta entrega.
- El seed usa una contraseña común y solo sirve para demostración.
- Las capturas de T08 cambian el estado del stack; hay que reiniciar AUTH
  después de mostrarla.
- `AUTH_SERVICE_SECRET` permanece local y no aparece en capturas ni logs.
