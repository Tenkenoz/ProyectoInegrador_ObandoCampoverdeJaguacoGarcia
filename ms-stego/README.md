# STEGO

Aplicación NestJS independiente para el microservicio de análisis de esteganografía.
Esta primera versión contiene únicamente la base generada con el CLI de Nest;
la autenticación, autorización, carga de imágenes y detección están pendientes.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.12.0.

## Instalación y ejecución

Desde `ms-stego/`:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm start:dev
```

La aplicación carga `.env` al iniciar y utiliza el puerto 3002 por defecto.
Puede cambiarlo con la variable `PORT`.

Comprobación del arranque:

```bash
curl http://localhost:3002/
```

La respuesta inicial es `Hello World!`.

## Compilación y producción

```bash
pnpm build
pnpm start:prod
```

## Verificación

```bash
pnpm lint
pnpm test
pnpm test:e2e
```

Las pruebas iniciales corresponden a la aplicación base de Nest.
