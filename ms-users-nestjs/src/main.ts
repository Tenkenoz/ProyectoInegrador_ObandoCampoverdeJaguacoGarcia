import {
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  Reflector,
} from '@nestjs/core';

import {
  NestFactory,
} from '@nestjs/core';

import {
  NestExpressApplication,
} from '@nestjs/platform-express';

import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import {
  AllExceptionsFilter,
} from './common/filters/all-exceptions/all-exceptions.filter.js';

import {
  AppModule,
} from './app.module.js';

async function bootstrap() {

  const app =
    await NestFactory
      .create<NestExpressApplication>(
        AppModule,
      );

  const config =
    app.get(
      ConfigService,
    );

  const nodeEnv =
    config.get<string>(
      'NODE_ENV',
    );

  /*
   * Encabezados HTTP de seguridad.
   */
  app.useSecurityHeaders();

  /*
   * Solamente confiar en un proxy
   * expresamente configurado.
   */
  const trustProxy =
    config.get<string>(
      'TRUST_PROXY',
    );

  if (trustProxy) {
    app.set(
      'trust proxy',
      trustProxy,
    );
  }

  /*
   * CORS restrictivo.
   */
  const origins =
    config
      .getOrThrow<string>(
        'CORS_ORIGINS',
      )
      .split(',')
      .map(
        (origin) =>
          origin.trim(),
      );

  app.enableCors({

    origin:
      origins,

    methods: [
      'GET',
      'POST',
      'PATCH',
      'DELETE',
    ],

    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-Id',
    ],

    exposedHeaders: [
      'X-Request-Id',
    ],

    credentials:
      false,

    maxAge:
      86400,
  });

  /*
   * Rechazar propiedades no declaradas.
   */
  app.useGlobalPipes(

    new ValidationPipe({

      whitelist:
        true,

      forbidNonWhitelisted:
        true,

      forbidUnknownValues:
        true,

      transform:
        true,

      validationError: {
        target:
          false,
        value:
          false,
      },

      disableErrorMessages:
        nodeEnv ===
        'production',
    }),
  );

  /*
   * Defensa adicional para campos
   * @Exclude().
   */
  app.useGlobalInterceptors(

    new ClassSerializerInterceptor(
      app.get(
        Reflector,
      ),
    ),
  );

  app.useGlobalFilters(
    new AllExceptionsFilter(),
  );

  /*
   * /api/v1/...
   */
  app.setGlobalPrefix(
    'api',
  );

  app.enableVersioning({

    type:
      VersioningType.URI,

    defaultVersion:
      '1',
  });

  /*
   * Swagger solo en desarrollo.
   */
  if (
    nodeEnv !==
    'production'
  ) {

    const swaggerConfig =
      new DocumentBuilder()
        .setTitle(
          'User Service',
        )
        .setDescription(
          'Microservicio de usuarios y roles',
        )
        .setVersion(
          '1.0',
        )
        .build();

    const document =
      SwaggerModule
        .createDocument(
          app,
          swaggerConfig,
        );

    SwaggerModule.setup(
      'docs',
      app,
      document,
    );
  }

  app.enableShutdownHooks();

  const port =
    config.get<number>(
      'PORT',
    ) ?? 3001;

  await app.listen(
    port,
  );

  console.log(
    `User Service: http://localhost:${port}/api/v1`,
  );

  if (
    nodeEnv !==
    'production'
  ) {

    console.log(
      `Swagger: http://localhost:${port}/docs`,
    );
  }
}

await bootstrap();
