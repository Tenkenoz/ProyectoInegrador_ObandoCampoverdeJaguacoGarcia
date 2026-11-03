# Ejecución local

## Estado

- Dependencias instaladas.
- `.env` local con secretos propios; excluido de Git y con permisos 0600.
- PostgreSQL: contenedor `users-postgres`, puerto local `127.0.0.1:5433`.
- API local: `http://127.0.0.1:3001/api/v1`.
- Swagger: `http://127.0.0.1:3001/docs`.
- No se incluye seeder ni pruebas automatizadas.
- Migración inicial incluida; `synchronize: false`.
- Los datos deben ingresarse después de aplicar la migración.

## Arranque

Desde `ms-users-nestjs/`:

```bash
docker compose up -d --wait
pnpm migration:run
pnpm start:dev
```

Si se instala desde cero, primero ejecutar `ppnpm add --frozen-lockfile`, crear `.env` desde
`example.env.dist` y establecer secretos propios.

La API escucha únicamente en localhost. `Ctrl+C` detiene una ejecución en primer
plano; `docker compose stop` detiene esta base sin borrar su volumen.

## Comandos útiles

```bash
pnpm build
pnpm lint
pnpm migration:show
pnpm migration:check
pnpm start:dev
```

## Migraciones

La migración inicial crea `users`, `roles` y `user_roles`, sus índices,
restricciones y claves foráneas. No activar `synchronize` para resolver
diferencias de esquema.

Revertir la migración inicial elimina las tres tablas y sus datos. Usar
únicamente en una base desechable o con respaldo.
