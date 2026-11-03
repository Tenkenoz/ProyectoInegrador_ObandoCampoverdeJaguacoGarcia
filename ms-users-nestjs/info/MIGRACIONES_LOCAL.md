# Migraciones locales

La configuración sigue `info/taller.md`: `synchronize: false` y migraciones explícitas. Los scripts usan el CLI TypeORM instalado (verificado con 1.1.2), compilan primero y cargan `dist/database/data-source.js`; no requieren ts-node. La conexión usa las variables `DB_*` de `.env`, con prioridad para las variables del proceso. `DB_SSL=true` exige un certificado válido. No se imprimen credenciales.

## Base nueva

Desde la raíz del proyecto, con PostgreSQL disponible y `.env` configurado:

```bash
pnpm migration:show
pnpm migration:run
pnpm migration:check
pnpm start:dev
```

La migración inicial ya está incluida: **no volver a generarla para instalar el proyecto**. Crea `users`, `roles`, `user_roles`, sus índices, restricciones y claves foráneas. TypeORM mantiene el historial en `migrations`; su controlador instala `uuid-ossp` para los UUID. El usuario de migración necesita los permisos correspondientes.

## Cambios posteriores y reversión

```bash
pnpm migration:generate src/database/migrations/NombreDelCambio
# Revisar el SQL generado antes de aplicarlo.
pnpm migration:run
pnpm migration:check
pnpm migration:show
```

`migration:check` comprueba diferencias entre entidades y esquema sin generar archivos. Sale con error si quedan diferencias; no sustituye comprobar el historial con `migration:show`.

```bash
pnpm migration:revert
```

**Revertir la migración inicial elimina las tres tablas y sus datos.** Probar únicamente en una base desechable o con respaldo y autorización. No activar `synchronize` para resolver diferencias.

## Si la base ya fue creada con synchronize

No ejecutar la migración inicial directamente sobre tablas existentes. Respaldar y verificar que el esquema coincide con la migración (incluidos índices, restricciones y relaciones), ejecutar `pnpm migration:check` y revisar `pnpm migration:show`. Solo si coincide y la inicial es la única migración pendiente, registrar el historial sin ejecutar el SQL:

```bash
pnpm migration:run --fake
pnpm migration:show
pnpm migration:check
```

`--fake` registra todas las migraciones pendientes: no usarlo si hay otras pendientes ni ante diferencias sin resolver. No se aplicó este procedimiento a `user_db` durante la validación aislada.

## Validación realizada

Se creó exclusivamente `migration_verify_hermes_7d93a1` en `users-postgres`, verificando cero tablas públicas antes de generar la inicial. Sin modificar `.env`, se usó el prefijo `DB_DATABASE=migration_verify_hermes_7d93a1` para:

```bash
pnpm migration:generate src/database/migrations/InitialSchema
pnpm migration:run
pnpm migration:check
pnpm migration:revert
pnpm migration:run
pnpm migration:show
pnpm migration:check
```

Resultados: compilación correcta; primera ejecución creó las tres tablas y registró la migración; reversión dejó únicamente `migrations` con cero registros; segunda ejecución correcta, historial aplicado y ninguna diferencia de esquema. La base temporal se eliminó al finalizar. No se modificaron `user_db` ni el servicio ajeno `taskflow-db`.
