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
