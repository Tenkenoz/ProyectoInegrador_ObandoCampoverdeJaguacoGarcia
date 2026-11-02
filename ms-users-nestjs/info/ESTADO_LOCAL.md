# Ejecución local y verificación del taller

## Estado comprobado

- Dependencias instaladas y actualizaciones compatibles aplicadas con `npm audit fix`.
- `.env` local con secretos aleatorios; excluido de Git y con permisos 0600.
- PostgreSQL: contenedor `users-postgres`, puerto local `127.0.0.1:5433`. Se conserva sin cambios el PostgreSQL del proyecto Taskflow en 5432.
- API local: `http://127.0.0.1:3001/api/v1`.
- Swagger: `http://127.0.0.1:3001/docs`.
- Datos de demostración: 5 usuarios, 3 roles y 6 asignaciones.
- Compilación y lint correctos.
- `npm test`: 1 prueba correcta.
- `npm run test:e2e`: 26 pruebas correctas contra HTTP real, con base temporal y limpieza al finalizar.
- Migración inicial incluida; `synchronize: false`. Historial aplicado y sin diferencias entre esquema y entidades.
- Como la base local había sido sembrada inicialmente con sincronización, se respaldó, se verificó la equivalencia del esquema y se registró únicamente la migración inicial con `--fake`. Una instalación nueva debe aplicar la migración normalmente, SIN `--fake`.

## Arranque posterior

Desde la raíz del repositorio:

```bash
docker compose up -d --wait
npm run migration:run
npm run start:dev
```

Si se instala desde cero, primero ejecutar `npm ci`, crear `.env` desde `example.env.dist`, establecer secretos propios y configurar el puerto disponible. Después de aplicar las migraciones, `npm run seed` carga los datos de demostración. El seed también actualiza y reactiva datos de demostración existentes: usarlo solamente en la base local del taller.

La API escucha únicamente en localhost. `Ctrl+C` detiene una ejecución en primer plano; `docker compose stop` detiene esta base sin borrar su volumen.

## Comprobaciones reproducibles

```bash
npm test
npm run test:e2e
npm run lint
npm run migration:show
npm run migration:check
npm audit --omit=dev
```

La suite E2E compila, crea una base con nombre `workshop_test_*`, aplica migraciones reales, ejecuta el seed, arranca la API en un puerto libre y elimina esa base al terminar. No modifica `user_db`; necesita un usuario PostgreSQL con permiso para crear bases (el usuario local de Docker lo tiene).

Cubre health, login, perfil, CRUD de usuarios y roles, asignación y retirada de roles, paginación, validaciones, campos inesperados, duplicados, ocultación de contraseñas, autenticación y autorización, cambio de roles desde PostgreSQL, token manipulado, logout y límite de intentos de login. Los ejemplos originales están en `info/guia-endpoints.md`; las cuentas y contraseñas de demostración están en `src/database/seed.ts` y no deben usarse en producción.

## Advertencia pendiente

`npm audit --omit=dev` reportó 0 vulnerabilidades. La auditoría completa conserva 5 alertas en la cadena de herramientas de desarrollo de `@nestjs/mau` (2 bajas, 1 moderada y 2 altas). No se aplicó `npm audit fix --force`, porque propone un cambio incompatible. Esto no impide realizar el taller local, pero no se declara que todas las dependencias estén libres de alertas ni que el proyecto esté listo para producción.

No se realizaron commits ni pushes al repositorio remoto.
