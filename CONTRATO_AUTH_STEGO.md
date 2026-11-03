# Contrato de integración AUTH–STEGO

Estado: propuesta aprobada por Mateo, pendiente de coordinación con Jonathan
(AUTH) y Erick (integración). Este documento define el comportamiento objetivo;
no implica que todos los controles ya estén implementados.

AUTH administra identidades, sesiones y roles. STEGO valida imágenes, ejecuta
análisis y conserva sus resultados en una base de datos independiente. Los dos
servicios mantienen procesos, configuración y despliegues autónomos.

## 1. JWT y claves públicas

| Elemento | Valor acordado |
| --- | --- |
| Algoritmo permitido | `RS256` exclusivamente |
| Clave RSA | Mínimo 2048 bits |
| Duración del token | 900 segundos (15 minutos) |
| Emisor (`iss`) | `secure-chat-auth` |
| Audiencia (`aud`) | `secure-chat-api` |
| Identidad (`sub`) | UUID del usuario |
| Tipo en el payload | `typ: "access"` |
| Versión de sesión | `tokenVersion`, entero no negativo |
| Claims obligatorios | `sub`, `iss`, `aud`, `iat`, `exp`, `typ`, `tokenVersion` |
| Identificador de clave | `kid` obligatorio en la cabecera JWT |
| Publicación de claves | `GET /.well-known/jwks.json` en AUTH |
| Tolerancia de reloj | 5 segundos |

La clave privada permanece exclusivamente en AUTH. JWKS publica únicamente
material público; cada clave incluye un `kid` único y corresponde a RS256.
STEGO rechaza algoritmos distintos, tokens malformados y claims ausentes o
inválidos. Si existe `nbf`, también se comprueba. Los roles del JWT o enviados
por el cliente no constituyen una decisión de autorización.

STEGO obtiene JWKS únicamente desde `AUTH_JWKS_URL`, una dirección configurada y
confiable. No sigue direcciones de claves indicadas en el token ni redirecciones
hacia otros destinos.

### Caché y rotación

- Las claves públicas se conservan en caché durante 5 minutos.
- Un `kid` desconocido permite una actualización de JWKS por solicitud, con
  un límite global de una actualización forzada cada 30 segundos. Las consultas
  concurrentes comparten la misma actualización.
- Si una consulta correcta confirma que el `kid` no existe, el token se rechaza
  con `401`.
- Si no puede obtenerse una clave necesaria por indisponibilidad, timeout o
  respuesta JWKS inválida, STEGO devuelve `503` y no procesa el archivo.
- Una clave ya disponible y vigente en caché permite verificar la firma, pero
  sigue siendo obligatoria la consulta de autorización actual a AUTH.
- Durante una rotación, AUTH conserva la clave pública anterior hasta que hayan
  expirado los tokens firmados con ella, incluida la tolerancia de reloj.

## 2. Autorización vigente

AUTH expone la ruta interna exacta siguiente, sin prefijo `/api/v1`:

```http
POST /internal/authorization/check
Content-Type: application/json
```

Solo STEGO autenticado mediante el mecanismo de la sección 4 puede invocarla.
AUTH verifica nuevamente el JWT, el usuario activo, la versión de sesión y sus
roles y asignaciones actuales antes de responder.

### Acciones admitidas

| Acción | `resource_id` | Uso |
| --- | --- | --- |
| `steganography.analyze` | `null` | Solicitar un análisis |
| `steganography.results.read` | UUID del análisis | Consultar un resultado |

Las acciones desconocidas se deniegan. Las peticiones malformadas o con un tipo
de recurso incompatible se rechazan con `400`.

Ejemplo para analizar:

```json
{
  "subject_token": "<JWT_DEL_USUARIO>",
  "action": "steganography.analyze",
  "resource_id": null
}
```

Ejemplo para consultar un resultado:

```json
{
  "subject_token": "<JWT_DEL_USUARIO>",
  "action": "steganography.results.read",
  "resource_id": "<UUID_ANALISIS>"
}
```

### Decisión válida

AUTH responde `200` tanto para permitir como para denegar por falta de permisos.

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

| Campo | Requisito |
| --- | --- |
| `subject_id` | Debe coincidir con `sub` del JWT verificado |
| `action` | Debe coincidir con la acción solicitada |
| `resource_id` | Debe coincidir con el recurso solicitado, incluido `null` |
| `allowed` | Booleano estricto |
| `scope` | `own` o `any` si se permite; `null` si se deniega |
| `reason` | Código estable de decisión, sin datos sensibles |

Para un usuario autenticado sin permisos:

```json
{
  "subject_id": "<UUID_USUARIO>",
  "action": "steganography.analyze",
  "resource_id": null,
  "allowed": false,
  "scope": null,
  "reason": "insufficient_permissions"
}
```

STEGO valida la estructura y correspondencia de la respuesta. Cualquier
inconsistencia produce `503`, sin procesamiento del archivo.

No se reutilizan decisiones entre solicitudes. Retirar o desactivar un rol o una
asignación debe afectar la siguiente consulta, aunque el JWT siga vigente.
Logout invalida la sesión mediante `tokenVersion`. Esta autorización se aplica
al inicio de cada operación; no cancela retroactivamente análisis ya iniciados.

## 3. Roles y propiedad de resultados

| Rol | Analizar | Consultar resultados |
| --- | --- | --- |
| `ADMIN` | Sí | Todos, con alcance `any` |
| `ANALYST` | Sí | Propios, con alcance `own` |
| `USER` | No | No |

Para ambas acciones, AUTH devuelve `any` si existe el rol activo ADMIN, o `own`
si existe ANALYST y no ADMIN. Si se acumulan roles, prevalece el mayor alcance
permitido. USER por sí solo no concede acceso a STEGO.

AUTH decide el permiso general y el alcance. STEGO verifica la propiedad con
el `user_id` persistido en su propia base de datos. Para `own`, ese valor debe
coincidir con `subject_id`; para `any`, puede consultarse cualquier resultado.
El solicitante de un análisis siempre es el usuario autenticado.

El cliente no puede establecer el propietario, los roles ni el alcance mediante
campos o cabeceras. STEGO no consulta tablas de AUTH ni AUTH accede a las tablas
de resultados de STEGO.

## 4. Autenticación HMAC entre servicios

Se utiliza HMAC-SHA256 con un secreto aleatorio de 32 bytes, exclusivo de la
integración AUTH–STEGO. Se configura como 64 caracteres hexadecimales; ambos
servicios decodifican ese valor a bytes antes de usarlo como clave.

Este secreto es distinto de las claves JWT. No se incluye en Git, respuestas,
capturas ni registros. Su rotación debe coordinarse entre ambos servicios.

### Cabeceras

```text
X-Service-Id: stego
X-Service-Timestamp: <segundos Unix en decimal>
X-Service-Nonce: <32 bytes aleatorios codificados como 64 caracteres hexadecimales>
X-Service-Signature: <HMAC-SHA256 como 64 caracteres hexadecimales en minúsculas>
```

### Construcción de la firma

La entrada es la siguiente secuencia UTF-8, separada por saltos LF (`\n`), sin
salto final:

```text
stego
POST
/internal/authorization/check
<timestamp>
<nonce>
<SHA-256 hexadecimal en minúsculas del cuerpo exacto>
```

Se calcula HMAC-SHA256 sobre esa secuencia usando el secreto decodificado.
El cuerpo se serializa una sola vez en STEGO: se firma y se envía exactamente la
misma secuencia de bytes. AUTH calcula el hash sobre el cuerpo recibido antes de
transformar el JSON. El endpoint no admite query string ni cuerpo comprimido.

### Verificación y protección contra repetición

AUTH realiza las siguientes comprobaciones:

1. Servicio identificado como `stego`, cabeceras presentes y formatos válidos.
2. Diferencia absoluta entre el timestamp y su reloj no superior a 30 segundos.
3. Firma correcta, comparada en tiempo constante tras comprobar su longitud.
4. Nonce no usado previamente por ese servicio.

Solo después de validar la firma se registra el nonce. La comprobación y el
registro son atómicos, para rechazar peticiones concurrentes repetidas. Cada
nonce aceptado se conserva durante 60 segundos desde su recepción.

Para la entrega con una sola instancia de AUTH, el registro puede mantenerse
en memoria con limpieza por expiración y capacidad acotada. Si no hay capacidad,
se deniega temporalmente el servicio; no se eliminan nonces aún vigentes para
aceptar nuevas solicitudes. Con varias réplicas se requiere almacenamiento
compartido. Un reinicio pierde ese registro: debe documentarse esta limitación
del despliegue inicial.

Este formato es un contrato propio. Se toman como referencia los controles
contra repetición de RFC 9421, sin afirmar compatibilidad completa con dicho RFC.

## 5. Canal seguro y configuración

STEGO se comunica con AUTH mediante HTTPS directo, verificando el certificado
con una CA local confiable. Erick coordina certificados y montajes; Jonathan
habilita HTTPS en AUTH. No se desactiva la validación TLS.

| Componente | Dirección o ruta propuesta |
| --- | --- |
| AUTH interno | `https://auth:3001` |
| STEGO interno | `http://stego:3002` |
| PostgreSQL exclusivo de STEGO | `stego-db:5432` |
| Cuarentena privada de STEGO | `/app/storage/quarantine` |

La conexión cliente–STEGO debe protegerse con HTTPS en el punto de entrada del
despliegue. El HTTP interno propuesto para STEGO no sustituye esa protección.

El certificado de AUTH debe incluir el nombre DNS `auth`. Los archivos privados
se montan fuera de la imagen y del repositorio. El certificado de la CA usado
por STEGO no contiene la clave privada de AUTH.

### Variables de STEGO para integración

| Variable | Valor o significado |
| --- | --- |
| `AUTH_BASE_URL` | `https://auth:3001` |
| `AUTH_JWKS_URL` | `https://auth:3001/.well-known/jwks.json` |
| `AUTH_CA_CERT_PATH` | Ruta del certificado de la CA montado en STEGO |
| `AUTH_SERVICE_ID` | `stego` |
| `AUTH_SERVICE_SECRET` | Secreto HMAC de 32 bytes, codificado en hexadecimal |
| `AUTH_TIMEOUT_MS` | `3000` |

Las URLs deben corresponder a destinos HTTPS confiables del despliegue. No se
aceptan redirecciones de la consulta interna de autorización. El timeout de
3 segundos limita la solicitud completa, incluida la lectura de la respuesta.
No hay reintentos automáticos de autorización. Cada consulta JWKS también
dispone de ese timeout.

Las variables `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` y `DB_DATABASE`
siguen siendo exclusivas de la base de datos de STEGO. Erick monta un volumen
persistente y no público para cuarentena, con permisos para el usuario del
contenedor. Nunca se publica esa carpeta como contenido estático.

## 6. Errores y orden de procesamiento

### Respuestas internas de AUTH

| HTTP | Código o significado |
| --- | --- |
| `200` | Decisión válida con `allowed: true` o `false` |
| `400` | `invalid_authorization_request` |
| `401` | `invalid_subject_token`, `subject_inactive` o `session_revoked` |
| `401` | `invalid_service_credentials` para HMAC inválido, timestamp fuera de ventana o nonce repetido |
| `503` | `authorization_unavailable` por fallo de dependencias o capacidad |

Los errores internos usan un campo `code` estable, por ejemplo:

```json
{
  "code": "session_revoked",
  "message": "Subject session is no longer valid"
}
```

AUTH autentica primero a STEGO. No revela información del usuario a un servicio
que no haya superado esa comprobación.

### Respuestas públicas de STEGO

| Situación | HTTP |
| --- | --- |
| JWT ausente, manipulado, vencido o de tipo incorrecto | `401` |
| Usuario desactivado o sesión revocada | `401` |
| Usuario autenticado sin permiso | `403` |
| Resultado ajeno cuando el alcance es `own` | `403` |
| Resultado inexistente, después de autorizar la acción | `404` |
| AUTH inaccesible, timeout, fallo TLS o respuesta inválida | `503` |
| Error de autenticación de STEGO ante AUTH | `503` y auditoría interna |

Para el endpoint de resultados, STEGO primero obtiene autorización para la acción,
después busca el recurso y finalmente comprueba su propietario. Una consulta a
un UUID inexistente devuelve `404` solo a quien ya tiene permiso para consultar
resultados. Esta política diferencia un recurso ajeno existente (`403`) de uno
inexistente (`404`); se documenta esa exposición limitada a usuarios autorizados.

En el endpoint de análisis, el orden obligatorio es:

1. Aplicar límites generales de entrada y validar JWT.
2. Consultar autorización vigente a AUTH y verificar su respuesta.
3. Ejecutar la recepción multipart y validar el archivo.
4. Decodificar, analizar y aplicar la política.
5. Persistir el resultado y registrar auditoría.

Los guards de identidad y autorización deben ejecutarse antes del interceptor
multipart. Esto evita guardar, decodificar o analizar imágenes sin permiso;
no impide que lleguen bytes a la red, por lo que también se aplican límites de
carga y tiempo desde el punto de entrada.

Ante denegación o ausencia de una decisión verificable, STEGO no ejecuta el
detector ni crea un análisis. No se usa una autorización antigua como respaldo.

## 7. Auditoría

Cada servicio registra eventos con fecha, identificador de correlación, acción,
identidad disponible, recurso, decisión y código de resultado. STEGO registra
fallos de autenticación del servicio y disponibilidad de AUTH como eventos
internos, sin trasladar sus detalles al cliente.

No se registran JWT completos, `subject_token`, cuerpos de la consulta interna,
secretos HMAC, firmas reutilizables, claves privadas, contraseñas ni contenido
de imágenes. Los ejemplos y evidencias se depuran antes de compartirlos.

## 8. Responsabilidades y verificación

| Responsable | Trabajo de integración |
| --- | --- |
| Jonathan | RS256, JWKS, HTTPS de AUTH, validación de sesión, RBAC vigente y endpoint interno con HMAC |
| Mateo | Verificación JWT/JWKS, cliente HTTPS/HMAC, validación de decisiones, propiedad y fallo seguro en STEGO |
| Erick | DNS y redes de Compose, certificados y secretos, base de datos y volumen de STEGO, pruebas conjuntas |

Antes de implementar la integración se deben confirmar con Jonathan y Erick
los valores y formatos de este contrato. Cualquier cambio debe reflejarse aquí
y en OpenAPI de ambos servicios.

La verificación conjunta debe cubrir al menos:

- JWT válido, ausente, vencido y manipulado; emisor, audiencia o algoritmo erróneos.
- `kid` desconocido, rotación y fallo de obtención de claves.
- HMAC incorrecto, cuerpo modificado, timestamp vencido y nonce repetido.
- ADMIN, ANALYST, USER y acumulación de roles.
- Acceso a resultados propios, ajenos e inexistentes.
- Retiro de rol y logout reutilizando un JWT aún no expirado.
- Timeout, caída de AUTH, fallo TLS y respuesta de autorización inconsistente.
- Ausencia de procesamiento de archivos cuando no existe autorización válida.

## Referencias

- [RFC 8725: JSON Web Token Best Current Practices](https://www.rfc-editor.org/rfc/rfc8725.html).
- [RFC 9421: HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html), como referencia de cobertura de mensajes y protección contra repetición.
- Documento del proyecto integrador, secciones 2.4, 2.5 y anexo B.
