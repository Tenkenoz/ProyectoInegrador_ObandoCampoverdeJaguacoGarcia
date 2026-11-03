# Convenciones de AUTH

Este documento aplica a `ms-users-nestjs` y complementa las reglas del
repositorio. El objetivo es mantener el código legible, consistente y seguro.

## pnpm

- El gestor de paquetes es `pnpm`.
- La versión fijada en `package.json` debe ser una versión estable y funcional.
- El archivo `pnpm-lock.yaml` se versiona.
- Para instalar dependencias:

```bash
pnpm install --frozen-lockfile
```

- Para agregar dependencias:

```bash
pnpm add <package>
pnpm add -D <package>
```

- No se usa `npm install`, `yarn` ni archivos `package-lock.json`.

## Idioma

- El código, los nombres de clases, funciones, variables, comentarios, logs,
  pruebas y mensajes de error están en inglés.
- La documentación de entrega puede estar en español para el informe del
  proyecto.
- Los nombres de dominio existentes que forman parte del contrato HTTP o de la
  base de datos se conservan tal como están para no romper compatibilidad.

## Casing

| Elemento                                    | Convención         | Ejemplo                       |
| ------------------------------------------- | ------------------ | ----------------------------- |
| Clases, interfaces, tipos y enums           | `PascalCase`       | `UserRolesService`            |
| Variables, funciones, métodos y propiedades | `camelCase`        | `findActiveWithRoles`         |
| Constantes y valores de enum                | `UPPER_SNAKE_CASE` | `ADMIN`, `ANALYST`, `USER`    |
| Archivos y carpetas                         | `kebab-case`       | `user-roles.service.ts`       |
| Tablas y columnas de PostgreSQL             | `snake_case`       | `user_roles`, `token_version` |

No se mezclan convenciones dentro del mismo módulo.

## Commits

Se usa Conventional Commits:

```text
<type>(auth): <summary in English>
```

Tipos permitidos:

- `feat(auth):`
- `fix(auth):`
- `refactor(auth):`
- `test(auth):`
- `docs(auth):`
- `chore(auth):`
- `build(auth):`

Cada commit debe explicar qué cambió, cómo se verificó y la tarea asociada.

## Pruebas

- Las pruebas unitarias usan Vitest.
- Las pruebas e2e usan Vitest + Supertest.
- Las pruebas de integración usan PostgreSQL, no SQLite, porque el esquema usa
  tipos y restricciones propias de PostgreSQL.
- Una tarea no se considera terminada si `pnpm build`, `pnpm lint` y las
  pruebas correspondientes fallan.

## Secretos

- Nunca se versionan `.env`, claves privadas, certificados privados, secretos
  HMAC ni tokens.
- Las claves JWT se generan fuera del repositorio y se montan en tiempo de
  ejecución.
- La clave privada de AUTH no se comparte con STEGO. STEGO solo consume el JWKS
  público.
- Los logs y la auditoría no incluyen JWT completos, contraseñas, firmas ni
  cuerpos sensibles.

## Ramas

- El trabajo se desarrolla en `feat/auth-hardening`.
- Se hace un push al final de cada fase verificada.
- El merge a `main` se realiza únicamente después de la aprobación y de la
  integración con STEGO.
