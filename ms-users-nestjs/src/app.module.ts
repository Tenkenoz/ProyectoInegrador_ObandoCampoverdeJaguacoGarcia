import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envSchema } from './config/env.schema.js';
import { RolesModule } from './roles/roles.module.js';
import { UserRolesModule } from './user-roles/user-roles.module.js';
import { UsersModule } from './users/users.module.js';
import { RequestIdMiddleware } from './common/middleware/request-id/request-id.middleware.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles/roles.guard.js';
import { AppController } from './app.controller.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { InternalAuthorizationModule } from './internal/authorization/internal-authorization.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envSchema,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.getOrThrow('DB_PORT')),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        autoLoadEntities: true,

        /*
         * Secure by Design:
         * never modify the schema
         * automatically.
         */
        synchronize: false,
        retryAttempts: 5,
        retryDelay: 2000,
        logging: ['error'],
        ssl:
          config.get<string>('DB_SSL') === 'true'
            ? {
                rejectUnauthorized: true,
              }
            : false,
        extra: {
          max: 10,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
        },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.getOrThrow('RATE_LIMIT_TTL_MS')),
          limit: Number(config.getOrThrow('RATE_LIMIT_MAX')),
          blockDuration: Number(config.getOrThrow('RATE_LIMIT_BLOCK_MS')),
        },
      ],
    }),
    UsersModule,
    RolesModule,
    UserRolesModule,
    AuthModule,
    AuthorizationModule,
    InternalAuthorizationModule,
  ],
  controllers: [AppController],
  providers: [
    /*
     * 1. Rate limiting
     */
    {
      provide: APP_GUARD,

      useClass: ThrottlerGuard,
    },

    /*
     * 2. JWT authentication
     */
    {
      provide: APP_GUARD,

      useClass: JwtAuthGuard,
    },

    /*
     * 3. Role-based authorization
     */
    {
      provide: APP_GUARD,

      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
