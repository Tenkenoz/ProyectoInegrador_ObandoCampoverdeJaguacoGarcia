# Implementación de JWT
En esta implementación los roles no se definirán dentro del JWT como fuente de autorización. El JWT identificará al usuario mediante sub; después, en cada petición protegida, NestJS consultará:
![Flujo de consulta](images\diagram.png)

y únicamente los roles con `user_roles.estado = true` y `roles.estado = true` serán utilizados por `RolesGuard`. De esta forma, si se retira un rol en PostgreSQL, el cambio se aplica en la siguiente petición aunque el JWT todavía no haya expirado.

>NestJS mantiene soporte oficial para Passport/JWT mediante `@nestjs/passport`, `passport-jwt` y `@nestjs/jwt`; Passport valida el bearer token y coloca el usuario autenticado en request.user. El patrón oficial de autorización RBAC usa metadata y un RolesGuard para comparar los roles requeridos con los del usuario.

## Arquitectura que vamos a implementar
El flujo será:
![texto alt](images\flujo.png)

### El JWT NO será la fuente de roles
El token tendrá solamente:
```
{
  "sub": "UUID-USUARIO",
  "username": "jperez",
  "typ": "access",
  "iat": 1234567890,
  "exp": 1234568790,
  "iss": "user-service",
  "aud": "ecommerce-api"
}
```
>Observe que deliberadamente no incluiremos:
```
{
  "roles": ["ADMIN"]
}
```
>como fuente de autorización.

>La asignación real será obtenida mediante:
```
SELECT r.rol
FROM users u
INNER JOIN user_roles ur
    ON ur.user_id = u.id
INNER JOIN roles r
    ON r.id = ur.role_id
WHERE u.id = :userId
  AND u.estado = true
  AND u.fecha_eliminacion IS NULL
  AND ur.estado = true
  AND r.estado = true
  AND r.fecha_eliminacion IS NULL;
```
_Este punto es central en el diseño._

## Generar el recurso Auth con Nest CLI

```
nest g resource auth --type rest --crud false --no-spec
```

### Generar los demás componentes

__DTO:__
```
nest g class auth/dto/login.dto --no-spec
```
__Strategy:__
```
nest g class auth/strategies/jwt.strategy --no-spec
```

__Guards:__
```
nest g guard auth/guards/jwt-auth --no-spec

nest g guard auth/guards/roles --no-spec
```

__Decoradores:__
```
nest g decorator auth/decorators/public --no-spec

nest g decorator auth/decorators/roles --no-spec

nest g decorator auth/decorators/current-user --no-spec
```
__Interfaces:__
```
nest g interface auth/interfaces/jwt-payload

nest g interface auth/interfaces/authenticated-user
```

### Instalar dependencias
__Ejecuta:__
```
npm install @nestjs/passport passport
```

__JWT:__
```
npm install @nestjs/jwt passport-jwt
```

__Tipos:__
```
npm install --save-dev @types/passport-jwt
```

__Argon2:__
```
npm install argon2
```

Nest documenta oficialmente `@nestjs/jwt`, `passport-jwt` y `@nestjs/passport` para la autenticación bearer JWT.

### Configurar `.env`
Agregar:
```
JWT_SECRET=CAMBIAR_POR_UN_SECRETO_ALEATORIO
JWT_EXPIRES_IN_SECONDS=900
JWT_ISSUER=user-service
JWT_AUDIENCE=ecommerce-api
```

### Validar las variables JWT
En: `src/config/env.schema.ts`, agregar:
```
JWT_SECRET: z
  .string()
  .min(
    32,
    'JWT_SECRET debe tener mínimo 32 caracteres',
  ),

JWT_EXPIRES_IN_SECONDS: z.coerce
  .number()
  .int()
  .min(60)
  .max(3600)
  .default(900),

JWT_ISSUER: z
  .string()
  .min(1)
  .default('user-service'),

JWT_AUDIENCE: z
  .string()
  .min(1)
  .default('secure-shop-api'),
```

### Crear LoginDto
Archivo: `src/auth/dto/login.dto.ts`

```
import {
  Transform,
} from 'class-transformer';

import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim().toLowerCase()
        : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(150)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
```
Permitiremos iniciar sesión mediante: `username` o `email`

Por ejemplo:
```
{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```
o:
```
{
  "identifier": "jperez@example.com",
  "password": "ClaveSegura2026!"
}
```

### Crear JwtPayload
Archivo: `src/auth/interfaces/jwt-payload.interface.ts` 
```
export interface JwtPayload {

  sub: string;

  username: string;

  typ: 'access';
}
```

### Crear AuthenticatedUser
Archivo:`src/auth/interfaces/authenticated-user.interface.ts`
```
export interface AuthenticatedUser {

  userId: string;

  username: string;

  email: string;

  roles: string[];
}
```
>Este objeto sí contiene roles, pero esos roles son construidos desde las tablas `user_roles` y `roles` después de validar el JWT.

### Modificar UsersService
`UsersService` mantiene todo el CRUD anterior.

#### Método para login
Agrega:
```
async findForAuthentication(
  identifier: string,
): Promise<User | null> {

  const normalized =
    identifier
      .trim()
      .toLowerCase();

  return this.usersRepository
    .createQueryBuilder(
      'user',
    )

    /*
     * passwordHash tiene:
     *
     * select: false
     *
     * por eso se solicita explícitamente.
     */
    .addSelect(
      'user.passwordHash',
    )

    .where(
      `
        (
          LOWER(user.username) = :identifier
          OR
          LOWER(user.email) = :identifier
        )
      `,
      {
        identifier:
          normalized,
      },
    )

    .andWhere(
      'user.estado = :estado',
      {
        estado:
          true,
      },
    )

    .andWhere(
      'user.fechaEliminacion IS NULL',
    )

    .getOne();
}
```

>Aquí todavía no necesitamos roles. La función exclusivamente busca: `usuario + passwordHash` para validar las credenciales.

#### Obtener usuario con roles vigentes
Este es el método más importante, en `UsersService`, agregar:
```
async findActiveWithRoles(
  id: string,
): Promise<User | null> {

  return this.usersRepository
    .createQueryBuilder(
      'user',
    )

    .leftJoinAndSelect(
      'user.userRoles',
      'userRole',
      `
        userRole.estado = :userRoleActive
      `,
      {
        userRoleActive:
          true,
      },
    )

    .leftJoinAndSelect(
      'userRole.role',
      'role',
      `
        role.estado = :roleActive
        AND role.fechaEliminacion IS NULL
      `,
      {
        roleActive:
          true,
      },
    )

    .where(
      'user.id = :id',
      {
        id,
      },
    )

    .andWhere(
      'user.estado = :userActive',
      {
        userActive:
          true,
      },
    )

    .andWhere(
      'user.fechaEliminacion IS NULL',
    )

    .getOne();
}
```

>Conceptualmente realiza:
```
users
  │
  │ user.id
  ▼
user_roles
  │
  │ role_id
  ▼
roles
```
y solamente obtiene:
```
user.estado = true
user_roles.estado = true
roles.estado = true
```

#### Verifica que `UsersService` sea exportado
En: `src/users/users.module.ts` debe quedar:

```
import {
  Module,
} from '@nestjs/common';

import {
  TypeOrmModule,
} from '@nestjs/typeorm';

import {
  User,
} from './entities/user.entity.js';

import {
  UsersController,
} from './users.controller.js';

import {
  UsersService,
} from './users.service.js';

@Module({

  imports: [

    TypeOrmModule.forFeature([
      User,
    ]),
  ],

  controllers: [
    UsersController,
  ],

  providers: [
    UsersService,
  ],

  exports: [
    UsersService,
  ],
})
export class UsersModule {}
```

#### Crear AuthService
Archivo: `src/auth/auth.service.ts`

```
import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  JwtService,
} from '@nestjs/jwt';

import * as argon2 from 'argon2';

import {
  randomBytes,
} from 'node:crypto';

import {
  UsersService,
} from '../users/users.service.js';

import {
  LoginDto,
} from './dto/login.dto.js';

import type {
  JwtPayload,
} from './interfaces/jwt-payload.interface.js';

@Injectable()
export class AuthService
  implements OnModuleInit {

  private dummyHash =
    '';

  constructor(

    private readonly usersService:
      UsersService,

    private readonly jwtService:
      JwtService,

    private readonly configService:
      ConfigService,
  ) {}

  async onModuleInit():
    Promise<void> {

    /*
     * Hash ficticio para reducir
     * diferencias temporales entre:
     *
     * usuario inexistente
     * contraseña incorrecta.
     */
    this.dummyHash =
      await argon2.hash(
        randomBytes(32)
          .toString('hex'),
        {
          type:
            argon2.argon2id,
        },
      );
  }

  async login(
    dto: LoginDto,
  ) {

    const user =
      await this.usersService
        .findForAuthentication(
          dto.identifier,
        );

    /*
     * Aunque no exista el usuario,
     * ejecutamos argon2.verify()
     * contra un hash ficticio.
     */
    const hash =
      user?.passwordHash ??
      this.dummyHash;

    const validPassword =
      await argon2.verify(
        hash,
        dto.password,
      );

    if (
      !user ||
      !validPassword
    ) {

      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    /*
     * IMPORTANTE:
     *
     * El JWT solamente identifica
     * al usuario.
     *
     * NO almacena roles.
     */
    const payload:
      JwtPayload = {

      sub:
        user.id,

      username:
        user.username,

      typ:
        'access',
    };

    const accessToken =
      await this.jwtService
        .signAsync(
          payload,
        );

    /*
     * Los roles que retornamos al cliente
     * también salen de PostgreSQL.
     */
    const currentUser =
      await this.usersService
        .findActiveWithRoles(
          user.id,
        );

    const roles =
      currentUser
        ?.userRoles

        ?.filter(
          (userRole) =>
            userRole.estado &&
            userRole.role?.estado,
        )

        .map(
          (userRole) =>
            userRole.role.rol,
        ) ?? [];

    return {

      accessToken,

      tokenType:
        'Bearer',

      expiresIn:
        this.configService
          .get<number>(
            'JWT_EXPIRES_IN_SECONDS',
          ) ?? 900,

      user: {

        id:
          user.id,

        username:
          user.username,

        email:
          user.email,

        roles: [
          ...new Set(
            roles,
          ),
        ],
      },
    };
  }
}
```

>El mensaje: `Credenciales inválidas` es deliberadamente genérico. No se devuelve: `Usuario no existe` ni: `Contraseña incorrecta` para dificultar la enumeración de usuarios.

#### Crear JwtStrategy
Archivo: `src/auth/strategies/jwt.strategy.ts`. Este será responsable de consultar PostgreSQL en cada petición.

```
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  PassportStrategy,
} from '@nestjs/passport';

import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';

import {
  UsersService,
} from '../../users/users.service.js';

import type {
  AuthenticatedUser,
} from '../interfaces/authenticated-user.interface.js';

import type {
  JwtPayload,
} from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtStrategy
  extends PassportStrategy(
    Strategy,
    'jwt',
  ) {

  constructor(

    configService:
      ConfigService,

    private readonly usersService:
      UsersService,
  ) {

    super({

      /*
       * Authorization:
       * Bearer eyJ...
       */
      jwtFromRequest:
        ExtractJwt
          .fromAuthHeaderAsBearerToken(),

      ignoreExpiration:
        false,

      secretOrKey:
        configService
          .getOrThrow<string>(
            'JWT_SECRET',
          ),

      issuer:
        configService
          .getOrThrow<string>(
            'JWT_ISSUER',
          ),

      audience:
        configService
          .getOrThrow<string>(
            'JWT_AUDIENCE',
          ),

      algorithms: [
        'HS256',
      ],
    });
  }

  async validate(
    payload:
      JwtPayload,
  ): Promise<AuthenticatedUser> {

    /*
     * Evita aceptar otro tipo
     * de JWT.
     */
    if (
      payload.typ !==
      'access'
    ) {

      throw new UnauthorizedException(
        'Token inválido',
      );
    }

    /*
     * ====================================
     * AQUÍ SE OBTIENEN LOS ROLES REALES
     * ====================================
     *
     * users
     *   ↓
     * user_roles
     *   ↓
     * roles
     */

    const user =
      await this.usersService
        .findActiveWithRoles(
          payload.sub,
        );

    if (!user) {

      throw new UnauthorizedException(
        'Usuario no autorizado',
      );
    }

    /*
     * Solamente asignaciones activas.
     */
    const roles =
      user.userRoles
        ?.filter(
          (userRole) =>

            userRole.estado &&

            userRole.role !==
              undefined &&

            userRole.role !==
              null &&

            userRole.role.estado,
        )

        .map(
          (userRole) =>
            userRole.role.rol,
        ) ?? [];

    /*
     * request.user recibirá este objeto.
     */
    return {

      userId:
        user.id,

      username:
        user.username,

      email:
        user.email,

      roles: [
        ...new Set(
          roles,
        ),
      ],
    };
  }
}
```

>Passport verifica firma y expiración antes de invocar validate(), y el objeto que devuelve validate() termina disponible como request.user. NestJS Documentación

Aquí es donde cumplimos tu condición:
```
ROL NO SALE DEL JWT
        ↓
ROL SALE DE PostgreSQL
        ↓
user_roles
        ↓
roles
```

#### Crear decorador @Public()
Archivo: `src/auth/decorators/public.decorator.ts`
```
import {
  SetMetadata,
} from '@nestjs/common';

export const IS_PUBLIC_KEY =
  'isPublic';

export const Public =
  () =>
    SetMetadata(
      IS_PUBLIC_KEY,
      true,
    );
```
Lo necesitaremos porque toda la API estará protegida por defecto.

#### Crear JwtAuthGuard
Archivo: `src/auth/guards/jwt-auth.guard.ts`

```
import {
  ExecutionContext,
  Injectable,
} from '@nestjs/common';

import {
  Reflector,
} from '@nestjs/core';

import {
  AuthGuard,
} from '@nestjs/passport';

import {
  IS_PUBLIC_KEY,
} from '../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard
  extends AuthGuard(
    'jwt',
  ) {

  constructor(
    private readonly reflector:
      Reflector,
  ) {

    super();
  }

  canActivate(
    context:
      ExecutionContext,
  ) {

    const isPublic =
      this.reflector
        .getAllAndOverride<boolean>(
          IS_PUBLIC_KEY,
          [
            context.getHandler(),
            context.getClass(),
          ],
        );

    if (isPublic) {

      return true;
    }

    return super
      .canActivate(
        context,
      );
  }
}
```
>Nest soporta registrar un guard de autenticación global y marcar únicamente determinadas rutas como públicas, que es preferible cuando casi toda la API requiere autenticación.

#### Crear decorador `@Roles()`
Archivo: `src/auth/decorators/roles.decorator.ts`

```
import {
  SetMetadata,
} from '@nestjs/common';

export const ROLES_KEY =
  'roles';

export const Roles =
  (...roles: string[]) =>
    SetMetadata(
      ROLES_KEY,
      roles,
    );
```

Esto permitirá: 
```
@Roles('ADMIN')
```
o:
```
@Roles(
  'ADMIN',
  'OPERADOR',
)
```

>Los textos `ADMIN` u `OPERADOR` aquí representan la política del endpoint. No significan que el usuario tenga esos roles. La posesión del rol se comprueba contra PostgreSQL.

#### Crear RolesGuard
Archivo: `src/auth/guards/roles.guard.ts`

```
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../decorators/roles/roles.decorator.js';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /*
     * Roles requeridos por
     * Controller/endpoint.
     */
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    /*
     * Si el endpoint no exige
     * ningún rol específico,
     * basta estar autenticado.
     */
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    /*
     * request.user fue creado
     * por JwtStrategy usando
     * roles provenientes de BD.
     */
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso no autorizado');
    }

    const currentRoles = new Set(user.roles.map((role) => role.toUpperCase()));

    const authorized = requiredRoles.some((requiredRole) =>
      currentRoles.has(requiredRole.toUpperCase()),
    );

    if (!authorized) {
      throw new ForbiddenException('No posee los roles requeridos');
    }

    return true;
  }
}

```
>Nest propone precisamente utilizar metadata de `roles + Reflector + guard` para implementar RBAC.

#### Crear @CurrentUser()
Archivo: `src/auth/decorators/current-user.decorator.ts`
```
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../interfaces/authenticated-user/authenticated-user.interface.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
    }>();

    return request.user;
  },
);
```

Así podemos escribir:
```
@CurrentUser()
user: AuthenticatedUser
```
sin manipular directamente `Request`.

#### Configurar AuthModule
Archivo: `src/auth/auth.module.ts`
```
import {
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import {
  JwtModule,
} from '@nestjs/jwt';

import {
  PassportModule,
} from '@nestjs/passport';

import {
  UsersModule,
} from '../users/users.module.js';

import {
  AuthController,
} from './auth.controller.js';

import {
  AuthService,
} from './auth.service.js';

import {
  JwtStrategy,
} from './strategies/jwt.strategy.js';

@Module({

  imports: [

    ConfigModule,

    UsersModule,

    PassportModule.register({

      defaultStrategy:
        'jwt',

      session:
        false,
    }),

    JwtModule.registerAsync({

      imports: [
        ConfigModule,
      ],

      inject: [
        ConfigService,
      ],

      useFactory:
        (
          config:
            ConfigService,
        ) => ({

          secret:
            config
              .getOrThrow<string>(
                'JWT_SECRET',
              ),

          signOptions: {

            algorithm:
              'HS256',

            expiresIn:
              config
                .get<number>(
                  'JWT_EXPIRES_IN_SECONDS',
                ) ?? 900,

            issuer:
              config
                .getOrThrow<string>(
                  'JWT_ISSUER',
                ),

            audience:
              config
                .getOrThrow<string>(
                  'JWT_AUDIENCE',
                ),
          },
        }),
    }),
  ],

  controllers: [
    AuthController,
  ],

  providers: [

    AuthService,

    JwtStrategy,
  ],

  exports: [

    AuthService,

    JwtModule,
  ],
})
export class AuthModule {}
```

#### Crear AuthController
Archivo: `src/auth/auth.controller.ts`

```
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public/public.decorator.js';
import { LoginDto } from './dto/login.dto/login.dto.js';
import { CurrentUser } from './decorators/current-user/current-user.decorator.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user/authenticated-user.interface.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /*
   * Ruta pública.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  /*
   * Requiere JWT.
   *
   * No requiere rol particular.
   */
  @Get('me')
  me(
    @CurrentUser()
    user: AuthenticatedUser,
  ) {
    return user;
  }
}
```

El rate limiting de login: `5 intentos / minuto` ayuda contra ataques de fuerza bruta. `@nestjs/throttler` soporta límites globales y overrides específicos mediante `@Throttle()`, con ttl expresado actualmente en milisegundos.

### Actualizar AppModule
```
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
         * nunca modificar automáticamente
         * el esquema.
         */
        synchronize: true,
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
  ],

  providers: [
    /*
     * 1. Rate Limiting
     */
    {
      provide: APP_GUARD,

      useClass: ThrottlerGuard,
    },

    /*
     * 2. Autenticación JWT
     */
    {
      provide: APP_GUARD,

      useClass: JwtAuthGuard,
    },

    /*
     * 3. Autorización por roles
     */
    {
      provide: APP_GUARD,

      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

#### Actualizar CORS
En `main.ts` incluir:
```
allowedHeaders: [

  'Content-Type',

  'Accept',

  'Authorization',

  'X-Request-Id',
],
```
## Protección de endpoints
### Proteger creación de usuarios
En: `users.controller.ts`

importar:
```
import {
  Roles,
} from '../auth/decorators/roles.decorator.js';

Ahora:
@Post()
@Roles('ADMIN')
@Throttle({
  default: {
    limit: 10,
    ttl: 60_000,
  },
})
create(
  @Body()
  dto: CreateUserDto,
) {

  return this.usersService
    .create(dto);
}
```
>Únicamente un usuario que realmente posea:
```
user_roles
    ↓
ADMIN
```
podrá crear usuarios.

#### Listar usuarios
```
@Get()
@Roles(
  'ADMIN',
  'OPERADOR',
)
findAll(
  @Query()
  pagination:
    PaginationQueryDto,
) {

  return this.usersService
    .findAll(
      pagination,
    );
}
```

#### Buscar usuario por cédula
```
@Get('cedula/:cedula')
@Roles(
  'ADMIN',
  'OPERADOR',
)
findByCedula(

  @Param(
    'cedula',
    CedulaPipe,
  )
  cedula: string,

) {

  return this.usersService
    .findByCedula(
      cedula,
    );
}
```

#### Buscar usuario por UUID
```
@Get(':id')
@Roles(
  'ADMIN',
  'OPERADOR',
)
findOne(

  @Param(
    'id',
    new ParseUUIDPipe({
      version: '4',
    }),
  )
  id: string,

) {

  return this.usersService
    .findOne(id);
}
```

#### Actualizar usuario
```
@Patch(':id')
@Roles(
  'ADMIN',
)
update(

  @Param(
    'id',
    new ParseUUIDPipe({
      version: '4',
    }),
  )
  id: string,

  @Body()
  dto:
    UpdateUserDto,

) {

  return this.usersService
    .update(
      id,
      dto,
    );
}
```

#### Eliminar usuario
```
@Delete(':id')
@Roles(
  'ADMIN',
)
@HttpCode(
  HttpStatus.NO_CONTENT,
)
async remove(

  @Param(
    'id',
    new ParseUUIDPipe({
      version: '4',
    }),
  )
  id: string,

): Promise<void> {

  await this.usersService
    .remove(id);
}
```
### RolesController
La administración de roles debe ser más restrictiva.

Crear:
```
@Post()
@Roles(
  'ADMIN',
)
```
Listar:
```
@Get()
@Roles(
  'ADMIN',
  'OPERADOR',
)
```
Consultar:
```
@Get(':id')
@Roles(
  'ADMIN',
  'OPERADOR',
)
```

Actualizar:
```
@Patch(':id')
@Roles(
  'ADMIN',
)
```

Eliminar:
```
@Delete(':id')
@Roles(
  'ADMIN',
)
```

### UserRolesController
Esta tabla determina la autorización real, por lo que modificarla debe ser una operación privilegiada.

Asignar rol:
```
@Post()
@Roles(
  'ADMIN',
)
```
Consultar roles:
```
@Get('user/:userId')
@Roles(
  'ADMIN',
  'OPERADOR',
)
```

Retirar rol:
```
@Delete(':userId/:roleId')
@Roles(
  'ADMIN',
)
```

### Agregar endpoint público de health
Como todos los endpoints quedan protegidos globalmente, crear:
```
import {
  Controller,
  Get,
} from '@nestjs/common';

import {
  Public,
} from './auth/decorators/public.decorator.js';

@Controller()
export class AppController {

  @Public()
  @Get('health')
  health() {

    return {

      status:
        'ok',

      service:
        'user-service',
    };
  }
}
```

`GET /api/v1/health` no requiere JWT.

## Login ADMIN
>Solicitud:
```
POST /api/v1/auth/login
Content-Type: application/json
```
```
{
  "identifier": "jperez",
  "password": "ClaveSegura2026!"
}
```
>Respuesta:
```
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "38b96696-bba8-469c-8df7-54f0cc28e907",
    "username": "jperez",
    "email": "jperez@example.com",
    "roles": [
      "ADMIN"
    ]
  }
}
```
Los roles mostrados en la respuesta fueron obtenidos de:
```
roles
+
user_roles
```
No del JWT.

#### Ejecutar logout
```
POST /api/v1/auth/logout
Authorization: Bearer TOKEN
```