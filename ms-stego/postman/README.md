# Colección de Postman de STEGO

La colección está creada en **Mateo Garcia's Workspace**, con 38 solicitudes en
español, nueve carpetas, scripts de comprobación y nueve ejemplos obtenidos de
pruebas locales reales. Los nombres de variables y los campos del protocolo
permanecen en inglés para conservar compatibilidad con el código y la API.

[Abrir la colección en Postman](https://www.postman.com/workspace/565ec35e-ce11-4ca9-8d59-1189ea51da0f/collection/54735887-263d5627-40ad-4808-af7f-a98561144d4d)

| Archivo | Contenido |
| --- | --- |
| [stego.postman_collection.json](stego.postman_collection.json) | Exportación v2.1 de la colección creada mediante MCP. |
| [local.postman_environment.json](local.postman_environment.json) | Entorno local, con origen `http://127.0.0.1:3002`. |
| [integrated.postman_environment.json](integrated.postman_environment.json) | Entorno del equipo, con el origen pendiente de configurar. |
| [examples-source.json](examples-source.json) | Procedencia de los ejemplos: respuestas de la evidencia local, fecha y huella del código. |
| [verification.json](verification.json) | Resultado de ejecutar el JSON exportado con Newman, incluida su huella SHA-256. |

Los dos entornos también están creados en Postman. Todos sus tokens compartidos
y los exportados están vacíos. Los ejemplos están etiquetados como locales y no
representan capturas finales del AUTH del equipo.

## Preparar Postman

1. Abre la colección del workspace o importa el JSON y uno de los entornos.
2. Selecciona el entorno. Configura `stego_origin` como un origen, sin `/api/v1`
   ni barra final; por ejemplo, `http://127.0.0.1:3002`.
3. En Postman Desktop, configura el directorio de trabajo como la carpeta
   `ms-stego` de este repositorio. Los archivos usan rutas relativas como
   `samples/original.png`; el JSON no incluye sus bytes. Con la aplicación web,
   usa Desktop Agent y vuelve a seleccionar los archivos cuando corresponda.
4. Desde `ms-stego/`, prepara las muestras adicionales:

   ```bash
   pnpm install --frozen-lockfile
   pnpm postman:files
   ```

5. Completa los tokens en los **valores locales** del entorno de Postman.
   No los publiques como valores compartidos ni los agregues a estos JSON.
6. Ejecuta las carpetas 00–04 y 08. Las carpetas 05–07 requieren preparación manual
   y se omiten mientras `run_manual_cases=false`. Omitirlas no acredita esas pruebas.

El generador adicional crea `postman/files/oversized.png`, `empty.png` y
`mismatched.bmp`. Estos archivos están excluidos de Git. Por defecto, el primero
tiene 5 MiB más un byte. Si cambia el límite del servicio, ejecuta
`pnpm postman:files 10485760`, por ejemplo, y actualiza las variables del entorno.

## Variables

| Variable | Configuración |
| --- | --- |
| `access_token` | JWT vigente del ANALYST propietario. |
| `expired_token` | JWT realmente vencido, emitido y firmado por el mismo AUTH. |
| `second_analyst_token` | JWT vigente de un segundo ANALYST distinto. |
| `admin_token` | JWT de ADMIN con autorización `scope=any`. |
| `user_token` | JWT válido de USER sin permiso de análisis. |
| `revocation_token` | JWT que se conservará sin cambios durante T07. |
| `analysis_id` | Se completa con el último análisis creado; también puede establecerse manualmente. |
| `retained_analysis_id` | Identificador de un análisis con original en cuarentena. |
| `missing_analysis_id` | UUID válido que no exista en la base de datos. |
| `expected_suspicious_action` | Política esperada para sospechosos; por defecto `cuarentena`. |
| `expected_inconclusive_action` | Política esperada para no concluyentes; por defecto `advertencia`. |
| `upload_max_file_bytes` | Límite real de archivo; por defecto `5242880`. |
| `oversized_file_bytes` | Tamaño del archivo generado; por defecto `5242881`. |
| `run_manual_cases` | `true` habilita las carpetas 05–07. |
| `role_revoked_confirmed` | `true` después de que Jonathan retire el rol para la segunda solicitud de T07. |
| `auth_unavailable_confirmed` | `true` después de detener o aislar AUTH en un entorno de pruebas. |
| `retention_cleanup_confirmed` | `true` después del vencimiento y la limpieza del original seleccionado. |
| `revocation_fingerprint` | Se completa con SHA-256 del JWT inicial de T07; no guarda el token. |
| `last_request_id` | Se completa en T12 para buscar la solicitud en la auditoría. |

Los tokens se validan y autorizan antes de procesar archivos. La colección no
inventa endpoints de login ni administra usuarios o roles de AUTH: esas operaciones
pertenecen a Jonathan. Tampoco almacena claves de firma ni secretos HMAC de servicio.
Una variable necesaria ausente produce una comprobación de configuración fallida
y omite la petición; no se presenta como un caso de seguridad aprobado.

## Carpetas y ejecución

| Carpeta | Solicitudes | Objetivo |
| --- | ---: | --- |
| 00 · Disponibilidad y contrato | 3 | Salud y contrato OpenAPI en JSON/YAML. |
| 01 · T03 — Autenticación | 4 | JWT ausente, malformado, manipulado y vencido. |
| 02 · T09 — Detección LSB y muestras | 7 | Hash, clasificación e indicadores de PNG/BMP, ruido y controles no concluyentes. |
| 03 · T10 — Validación de archivos | 9 | Corrupción, extensión falsa, tamaño, vacío, campo incorrecto, MIME de solicitud y firma inconsistente. |
| 04 · Resultados persistentes | 6 | Crear y consultar evidencia, errores de identificación, autenticación y ausencia de descarga pública. |
| 05 · T04 y T11 — Roles y propiedad reales | 4 | Propietario, otro ANALYST, ADMIN y USER. |
| 06 · T07 — Revocación con el mismo JWT | 2 | Comparar el permiso antes y después de retirar un rol. |
| 07 · Dependencias y retención | 2 | Fallo seguro de AUTH y consulta tras eliminar el original vencido. |
| 08 · T12 — Correlación y auditoría | 1 | Correlación generada por el servidor y preparación de revisión externa. |

Para las muestras T09, utiliza los parámetros LSB de
[samples/manifest.json](../samples/manifest.json). Los tests comparan sus métricas
con una tolerancia de `1e-9`. Un cambio de parámetros requiere revisar las
expectativas; no ocultes un resultado distinto cambiando el umbral durante la demo.
El ruido se conserva como falso positivo conocido. Un p-value alto no demuestra
contenido oculto, y `sin_indicios` no demuestra ausencia de cualquier técnica.

Para T07, ejecuta la primera petición individualmente, solicita a Jonathan retirar
el rol y, sin reemplazar `revocation_token`, marca `role_revoked_confirmed=true`
y ejecuta la segunda. No ejecutes ambas seguidas en un Runner contra AUTH real:
la colección no retira roles ni introduce una pausa que sustituya esa operación.

Para la retención, ejecuta la consulta de la carpeta 07 individualmente después de
que el original indicado por `retained_analysis_id` haya vencido y se haya limpiado.
No ejecutes nuevos análisis antes de esa consulta si actualizan el identificador.
Las respuestas históricas y la política deben seguir disponibles con estado `deleted`.

T12 solo comprueba la correlación HTTP desde Postman. Para acreditar ausencia de
secretos en el servidor, revisa los logs y ejecuta
[audit-review.sql](../docs/evidence/audit-review.sql) con el operador de base de
datos. La colección no tiene acceso al servidor ni un endpoint de auditoría.

## Verificación reproducible sin el AUTH del equipo

```bash
pnpm test:postman
```

Requiere Docker y OpenSSL. Inicia STEGO con PostgreSQL aislado y un AUTH HTTPS de
pruebas, y ejecuta **el JSON exportado** con Newman. Comprueba 30 solicitudes
normales y ocho solicitudes con condiciones controladas: sujetos y decisiones
simulados, revocación simulada, indisponibilidad simulada y limpieza real del
original. Las claves y tokens temporales solo existen en memoria de la prueba.
No se envían a Postman ni se exportan. Los recursos se eliminan al terminar.

La ejecución completa aprobó **38 solicitudes y 158 aserciones**, además de la
comprobación de procedencia de ejemplos y ausencia de credenciales exportadas.
`verification.json` contiene la fecha y la huella exacta del JSON verificado. Un
fallo no reemplaza el informe anterior: comprueba el código de salida, la fecha
y la huella antes de usarlo como evidencia.

También puedes usar Newman contra un entorno disponible:

```bash
pnpm exec newman run postman/stego.postman_collection.json \
  -e /ruta/local/entorno-con-valores-privados.json \
  --working-dir . --no-insecure-file-read
```

Ese archivo privado debe quedar fuera del repositorio. No exportes ni compartas
un resumen completo del Runner que incluya cabeceras Authorization. El informe
versionado de esta prueba solo guarda conteos, alcance y huella del archivo.

## Regeneración y sincronización

```bash
pnpm postman:generate
```

Regenera los JSON locales desde módulos separados en `scripts/postman/`, el
manifiesto de muestras y la evidencia local. No sincroniza automáticamente la
colección de la nube. Puede reemplazar metadatos de exportación y reinicia los
valores de los entornos; no lo uses sobre archivos con credenciales privadas.

Para una actualización mediante MCP, conserva los IDs existentes, modifica las
solicitudes, vuelve a exportar la colección y ejecuta `pnpm test:postman` contra
esa exportación. La API usada por MCP representa los campos de archivo mediante
`data[].value`; la exportación v2.1 los representa con `body.formdata[].src`.
Comprueba que las rutas de archivo permanezcan después de sincronizar. Los bytes
de los archivos no se suben al workspace mediante esta colección.

## Pendientes del equipo

- Obtener los tokens reales y repetir T03, T04, T07 y T11 con Jonathan.
- Ejecutar los casos de indisponibilidad y retención en el Compose final con Erick.
- Capturar en Postman solicitud, respuesta, HTTP y `X-Request-Id`, ocultando credenciales.
- Correlacionar T12 con registros depurados y entregar las evidencias a Campoverde.
