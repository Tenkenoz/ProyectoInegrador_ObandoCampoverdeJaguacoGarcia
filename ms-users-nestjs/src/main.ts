import {
  ClassSerializerInterceptor,
  RequestMethod,
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
   * HTTP security headers.
   */
  app.useSecurityHeaders();

  /*
   * Only trust a proxy that has been
   * explicitly configured.
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
   * Restrictive CORS configuration.
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
   * Reject undeclared properties.
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
   * Additional protection for fields
   * marked with @Exclude().
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
   *
   * JWKS is published at the root because STEGO
   * consumes it as /.well-known/jwks.json.
   */
  app.setGlobalPrefix(
    'api',
    {
      exclude: [
        {
          path: '.well-known/jwks.json',
          method: RequestMethod.GET,
        },
      ],
    },
  );

  app.enableVersioning({

    type:
      VersioningType.URI,

    defaultVersion:
      '1',
  });

  /*
   * Swagger is only exposed in development.
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
          'User and role management microservice',
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
