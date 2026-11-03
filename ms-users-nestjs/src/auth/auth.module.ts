import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SecurityModule } from '../common/security/security.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwksController } from './jwks/jwks.controller.js';
import { JwtKeyService } from './jwt-keys/jwt-key.service.js';
import { JwtKeysModule } from './jwt-keys/jwt-keys.module.js';
import { JwtStrategy } from './strategies/jwt.strategy/jwt.strategy.js';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    SecurityModule,
    JwtKeysModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule, JwtKeysModule],
      inject: [ConfigService, JwtKeyService],
      useFactory: (config: ConfigService, jwtKeys: JwtKeyService) => ({
        privateKey: jwtKeys.getPrivateKeyPem(),

        signOptions: {
          algorithm: 'RS256',
          expiresIn: config.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 900,
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
          keyid: jwtKeys.getKeyId(),
        },
      }),
    }),
  ],

  controllers: [AuthController, JwksController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
