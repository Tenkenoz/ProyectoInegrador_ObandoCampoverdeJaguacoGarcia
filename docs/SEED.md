# Seed de demostración

El seed crea solo usuarios y asignaciones usuario–rol para ensayos y para la
presentación. **No se ejecuta automáticamente** y no crea roles: `ADMIN`,
`ANALYST` y `USER` provienen de las migraciones de AUTH.

## Usuarios

La contraseña se toma de `SEED_DEFAULT_PASSWORD` (mínimo 12 caracteres). Si no
está definida, se usa `DemoSeguro2026!`, solo para este despliegue local.

| Usuario | Nombre | Email | Roles |
| --- | --- | --- | --- |
| `admin` | Admin Demo | `admin@demo.local` | ADMIN |
| `analyst.one` | Analista Uno | `analyst.one@demo.local` | ANALYST |
| `analyst.two` | Analista Dos | `analyst.two@demo.local` | ANALYST |
| `user.standard` | Usuario Estandar | `user.standard@demo.local` | USER |
| `dual.role` | Doble Rol | `dual.role@demo.local` | ADMIN, ANALYST |

Datos de demostración:

| Usuario | Cédula | Teléfono | F. nacimiento |
| --- | --- | --- | --- |
| `admin` | `1700000001` | `0990000001` | 1990-01-01 |
| `analyst.one` | `1700000002` | `0990000002` | 1991-02-02 |
| `analyst.two` | `1700000003` | `0990000003` | 1992-03-03 |
| `user.standard` | `1700000004` | `0990000004` | 1993-04-04 |
| `dual.role` | `1700000005` | `0990000005` | 1994-05-05 |

Las contraseñas se guardan como **Argon2id**, con los mismos parámetros que
usa el registro normal de AUTH (`memoryCost: 19456`, `timeCost: 2`,
`parallelism: 1`).

## Ejecutar

```bash
docker compose --profile seed run --rm seed
```

El servicio no hace nada si `SEED_DEMO` no es `1`; el perfil ya lo define.

## Comportamiento

- **Idempotente**: si el usuario o la asignación ya existe, se conserva tal
  cual y se registra como `skipped`.
- **Sin duplicar roles**: si falta un rol, se avisa con un conteo
  `missing roles` y el proceso termina con código 2. Es necesario ejecutar las
  migraciones de AUTH antes del seed.
- **No modifica datos existentes**: un cambio de contraseña o de roles hecho a
  mano no se sobrescribe al volver a ejecutar el seed.

Salida de una segunda ejecución:

```text
[seed] user admin: skipped (already exists)
[seed] assignment admin -> ADMIN: skipped (already exists)
...
[seed] summary | users created=0 skipped=5 | assignments created=0 skipped=6 | missing roles=0
```

## Flujo recomendado

```bash
docker compose --profile tools run --rm migrate
docker compose --profile seed run --rm seed
```

## Limitaciones

- Las contraseñas son las mismas para todos los usuarios; cambiarlas en
  `.env` antes de ejecutar el seed.
- Los usuarios del seed son datos de demostración. No usarlos en producción.
- El seed no borra usuarios de prueba creados por Postman; la colección incluye
  una carpeta de limpieza.
