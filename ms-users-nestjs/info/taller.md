# Taller Sincrónico

## Creación de DTO's

1. **DTO CreateUser**
   `src/users/dto/create-user.dto.ts`

```
import { Transform } from 'class-transformer';

import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {

  @IsString()
  @Matches(
    /^[0-9]{10}$/,
    {
      message:
        'La cédula debe contener exactamente 10 dígitos',
    },
  )
  cedula!: string;

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  nombres!: string;

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim()
        : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  apellidos!: string;

  @IsDateString()
  fechaNacimiento!: string;

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim().toLowerCase()
        : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  @Matches(/^[a-z0-9._-]+$/)
  username!: string;

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim().toLowerCase()
        : value,
  )
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
```
2. __DTO UpdateUser__
`src/users/dto/update-user.dto.ts`
```
import {
  OmitType,
  PartialType,
} from '@nestjs/mapped-types';

import {
  CreateUserDto,
} from './create-user.dto.js';

export class UpdateUserDto extends PartialType(
  OmitType(
    CreateUserDto,
    ['cedula'] as const,
  ),
) {}
```

3. __DTO Role__

`src/roles/dto/create-role.dto.ts`

```
import { Transform } from 'class-transformer';

import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim().toUpperCase()
        : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  rol!: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
```

`src/roles/dto/update-role.dto.ts`

```
import {
  PartialType,
} from '@nestjs/mapped-types';

import {
  CreateRoleDto,
} from './create-role.dto.js';

export class UpdateRoleDto extends PartialType(
  CreateRoleDto,
) {}
```

4. __DTO UserRole__

`src/user-roles/dto/create-user-role.dto.ts`

```
import {
  IsUUID,
} from 'class-validator';

export class CreateUserRoleDto {

  @IsUUID('4')
  userId!: string;

  @IsUUID('4')
  roleId!: string;
}
```
__Nota:__ No es necesario actualizar una relación usuario-rol. Para cambiarla se elimina y se crea otra.

5. __Paginación segura__

`src/common/dto/pagination-query.dto.ts`

```
import { Type } from 'class-transformer';

import {
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class PaginationQueryDto {

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
```

__Nota:__ Esto evita consultas como:
```
GET /users?limit=10000000
```
El máximo será:
```
100
```

6. __Pipe para cédula__

`src/common/pipes/cedula.pipe.ts`
```
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

@Injectable()
export class CedulaPipe
  implements PipeTransform<string, string> {

  transform(
    value: string,
    _metadata: ArgumentMetadata,
  ): string {

    if (!/^[0-9]{10}$/.test(value)) {
      throw new BadRequestException(
        'La cédula debe contener exactamente 10 dígitos',
      );
    }

    return value;
  }
}
```

7. __Request ID__

`src/common/middleware/request-id.middleware.ts`

```
import {
  Injectable,
  NestMiddleware,
} from '@nestjs/common';

import {
  NextFunction,
  Request,
  Response,
} from 'express';

import {
  randomUUID,
} from 'node:crypto';

type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware
  implements NestMiddleware {

  use(
    req: RequestWithId,
    res: Response,
    next: NextFunction,
  ): void {

    const received =
      req.header('x-request-id');

    const isValid =
      received &&
      /^[A-Za-z0-9._-]{1,64}$/.test(received);

    const requestId =
      isValid
        ? received
        : randomUUID();

    req.requestId = requestId;

    res.setHeader(
      'X-Request-Id',
      requestId,
    );

    next();
  }
}
```

__Nota:__ Esto será muy útil posteriormente cuando API Gateway, Product Service y Order Service tengan que correlacionar logs.

8. __Filtro global seguro__

`src/common/filters/all-exceptions.filter.ts`

```
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import {
  Request,
  Response,
} from 'express';

type RequestWithId = Request & {
  requestId?: string;
};

@Catch()
export class AllExceptionsFilter
  implements ExceptionFilter {

  private readonly logger =
    new Logger(AllExceptionsFilter.name);

  catch(
    exception: unknown,
    host: ArgumentsHost,
  ): void {

    const ctx =
      host.switchToHttp();

    const response =
      ctx.getResponse<Response>();

    const request =
      ctx.getRequest<RequestWithId>();

    const isHttpException =
      exception instanceof HttpException;

    const status =
      isHttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message:
      | string
      | string[] =
      'Internal server error';

    if (isHttpException) {

      const exceptionResponse =
        exception.getResponse();

      if (
        typeof exceptionResponse === 'string'
      ) {

        message = exceptionResponse;

      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {

        message =
          (
            exceptionResponse as {
              message: string | string[];
            }
          ).message;
      }
    }

    if (
      status >=
      HttpStatus.INTERNAL_SERVER_ERROR
    ) {

      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error
          ? exception.stack
          : undefined,
      );
    }

    response
      .status(status)
      .json({
        statusCode: status,
        message,
        timestamp:
          new Date().toISOString(),
        path: request.url,
        requestId:
          request.requestId,
      });
  }
}
```
## Componente Usuarios

1. **UsersService**

`src/users/users.service.ts`

```
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  InjectRepository,
} from '@nestjs/typeorm';

import * as argon2 from 'argon2';

import {
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';

import {
  CreateUserDto,
} from './dto/create-user.dto.js';

import {
  UpdateUserDto,
} from './dto/update-user.dto.js';

import {
  User,
} from './entities/user.entity.js';

function isUniqueViolation(
  error: unknown,
): boolean {

  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError =
    error.driverError as {
      code?: string;
    };

  return driverError?.code === '23505';
}

@Injectable()
export class UsersService {

  constructor(
    @InjectRepository(User)
    private readonly usersRepository:
      Repository<User>,
  ) {}

  async create(
    dto: CreateUserDto,
  ): Promise<User> {

    const {
      password,
      ...data
    } = dto;

    const passwordHash =
      await argon2.hash(
        password,
        {
          type: argon2.argon2id,
        },
      );

    const user =
      this.usersRepository.create({
        ...data,
        passwordHash,
      });

    try {

      const saved =
        await this.usersRepository.save(
          user,
        );

      /*
       * Se consulta nuevamente para no
       * retornar passwordHash.
       */
      return this.findOne(
        saved.id,
      );

    } catch (error) {

      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Los datos del usuario entran en conflicto con un registro existente',
        );
      }

      throw error;
    }
  }

  async findAll(
    pagination: PaginationQueryDto,
  ) {

    const {
      page,
      limit,
    } = pagination;

    const [
      data,
      total,
    ] =
      await this.usersRepository
        .findAndCount({

          relations: {
            userRoles: {
              role: true,
            },
          },

          skip:
            (page - 1) *
            limit,

          take:
            limit,

          order: {
            fechaCreacion:
              'DESC',
          },
        });

    return {
      data,

      meta: {
        page,
        limit,
        total,

        totalPages:
          Math.ceil(
            total /
            limit,
          ),
      },
    };
  }

  async findOne(
    id: string,
  ): Promise<User> {

    const user =
      await this.usersRepository
        .findOne({

          where: {
            id,
          },

          relations: {
            userRoles: {
              role: true,
            },
          },
        });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    return user;
  }

  async findByCedula(
    cedula: string,
  ): Promise<User> {

    const user =
      await this.usersRepository
        .findOne({

          where: {
            cedula,
          },

          relations: {
            userRoles: {
              role: true,
            },
          },
        });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    return user;
  }

  async exists(
    id: string,
  ): Promise<boolean> {

    return this.usersRepository
      .exists({
        where: {
          id,
        },
      });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
  ): Promise<User> {

    const user =
      await this.usersRepository
        .findOneBy({
          id,
        });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    const {
      password,
      ...data
    } = dto;

    Object.assign(
      user,
      data,
    );

    if (password) {

      user.passwordHash =
        await argon2.hash(
          password,
          {
            type: argon2.argon2id,
          },
        );
    }

    try {

      await this.usersRepository
        .save(user);

      return this.findOne(id);

    } catch (error) {

      if (isUniqueViolation(error)) {

        throw new ConflictException(
          'Los datos del usuario entran en conflicto con un registro existente',
        );
      }

      throw error;
    }
  }

  async remove(
    id: string,
  ): Promise<void> {

    const result =
      await this.usersRepository
        .softDelete(id);

    if (!result.affected) {

      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }
  }
}
```

__Nota:__ Aquí hay un aspecto particularmente importante: aunque el microservicio todavía no tenga login, una contraseña nunca debe persistirse en texto plano.

2. __UsersController__

`src/users/users.controller.ts`

```
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  Throttle,
} from '@nestjs/throttler';

import {
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';

import {
  CedulaPipe,
} from '../common/pipes/cedula.pipe.js';

import {
  CreateUserDto,
} from './dto/create-user.dto.js';

import {
  UpdateUserDto,
} from './dto/update-user.dto.js';

import {
  UsersService,
} from './users.service.js';

@Controller('users')
export class UsersController {

  constructor(
    private readonly usersService:
      UsersService,
  ) {}

  @Post()
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

  @Get()
  findAll(
    @Query()
    pagination:
      PaginationQueryDto,
  ) {

    return this.usersService
      .findAll(pagination);
  }

  @Get('cedula/:cedula')
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

  @Get(':id')
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

  @Patch(':id')
  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  update(

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateUserDto,

  ) {

    return this.usersService
      .update(
        id,
        dto,
      );
  }

  @Delete(':id')
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
}
```

3. __UsersModule__

`src/users/users.module.ts`
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

## Roles
1. __RolesService__

`src/roles/roles.service.ts`

```
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  InjectRepository,
} from '@nestjs/typeorm';

import {
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';

import {
  CreateRoleDto,
} from './dto/create-role.dto.js';

import {
  UpdateRoleDto,
} from './dto/update-role.dto.js';

import {
  Role,
} from './entities/role.entity.js';

@Injectable()
export class RolesService {

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository:
      Repository<Role>,
  ) {}

  async create(
    dto: CreateRoleDto,
  ): Promise<Role> {

    const role =
      this.rolesRepository
        .create(dto);

    try {

      return await this.rolesRepository
        .save(role);

    } catch (error) {

      if (
        error instanceof QueryFailedError &&
        (
          error.driverError as {
            code?: string;
          }
        )?.code === '23505'
      ) {

        throw new ConflictException(
          'El rol ya existe',
        );
      }

      throw error;
    }
  }

  async findAll(
    pagination: PaginationQueryDto,
  ) {

    const {
      page,
      limit,
    } = pagination;

    const [
      data,
      total,
    ] =
      await this.rolesRepository
        .findAndCount({

          skip:
            (page - 1) *
            limit,

          take:
            limit,

          order: {
            rol: 'ASC',
          },
        });

    return {

      data,

      meta: {
        page,
        limit,
        total,

        totalPages:
          Math.ceil(
            total /
            limit,
          ),
      },
    };
  }

  async findOne(
    id: string,
  ): Promise<Role> {

    const role =
      await this.rolesRepository
        .findOneBy({
          id,
        });

    if (!role) {

      throw new NotFoundException(
        'Rol no encontrado',
      );
    }

    return role;
  }

  async exists(
    id: string,
  ): Promise<boolean> {

    return this.rolesRepository
      .exists({
        where: {
          id,
        },
      });
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
  ): Promise<Role> {

    const role =
      await this.findOne(id);

    Object.assign(
      role,
      dto,
    );

    try {

      return await this.rolesRepository
        .save(role);

    } catch (error) {

      if (
        error instanceof QueryFailedError &&
        (
          error.driverError as {
            code?: string;
          }
        )?.code === '23505'
      ) {

        throw new ConflictException(
          'El rol ya existe',
        );
      }

      throw error;
    }
  }

  async remove(
    id: string,
  ): Promise<void> {

    const result =
      await this.rolesRepository
        .softDelete(id);

    if (!result.affected) {

      throw new NotFoundException(
        'Rol no encontrado',
      );
    }
  }
}
```
2. __RolesController__
```
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  Throttle,
} from '@nestjs/throttler';

import {
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';

import {
  CreateRoleDto,
} from './dto/create-role.dto.js';

import {
  UpdateRoleDto,
} from './dto/update-role.dto.js';

import {
  RolesService,
} from './roles.service.js';

@Controller('roles')
export class RolesController {

  constructor(
    private readonly rolesService:
      RolesService,
  ) {}

  @Post()
  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  create(
    @Body()
    dto: CreateRoleDto,
  ) {

    return this.rolesService
      .create(dto);
  }

  @Get()
  findAll(
    @Query()
    pagination:
      PaginationQueryDto,
  ) {

    return this.rolesService
      .findAll(pagination);
  }

  @Get(':id')
  findOne(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {

    return this.rolesService
      .findOne(id);
  }

  @Patch(':id')
  update(

    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,

    @Body()
    dto: UpdateRoleDto,

  ) {

    return this.rolesService
      .update(
        id,
        dto,
      );
  }

  @Delete(':id')
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

    await this.rolesService
      .remove(id);
  }
}
```
3. __RolesModule__
```
import {
  Module,
} from '@nestjs/common';

import {
  TypeOrmModule,
} from '@nestjs/typeorm';

import {
  Role,
} from './entities/role.entity.js';

import {
  RolesController,
} from './roles.controller.js';

import {
  RolesService,
} from './roles.service.js';

@Module({

  imports: [
    TypeOrmModule.forFeature([
      Role,
    ]),
  ],

  controllers: [
    RolesController,
  ],

  providers: [
    RolesService,
  ],

  exports: [
    RolesService,
  ],
})
export class RolesModule {}
```
## User-Roles
1. __UserRolesService__

```
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  InjectRepository,
} from '@nestjs/typeorm';

import {
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  RolesService,
} from '../roles/roles.service.js';

import {
  UsersService,
} from '../users/users.service.js';

import {
  CreateUserRoleDto,
} from './dto/create-user-role.dto.js';

import {
  UserRole,
} from './entities/user-role.entity.js';

@Injectable()
export class UserRolesService {

  constructor(

    @InjectRepository(UserRole)
    private readonly userRolesRepository:
      Repository<UserRole>,

    private readonly usersService:
      UsersService,

    private readonly rolesService:
      RolesService,
  ) {}

  async create(
    dto: CreateUserRoleDto,
  ) {

    const [
      userExists,
      roleExists,
    ] =
      await Promise.all([

        this.usersService
          .exists(dto.userId),

        this.rolesService
          .exists(dto.roleId),
      ]);

    if (!userExists) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    if (!roleExists) {
      throw new NotFoundException(
        'Rol no encontrado',
      );
    }

    const relation =
      this.userRolesRepository
        .create(dto);

    try {

      return await this.userRolesRepository
        .save(relation);

    } catch (error) {

      if (
        error instanceof QueryFailedError &&
        (
          error.driverError as {
            code?: string;
          }
        )?.code === '23505'
      ) {

        throw new ConflictException(
          'El usuario ya posee este rol',
        );
      }

      throw error;
    }
  }

  async findByUser(
    userId: string,
  ) {

    const exists =
      await this.usersService
        .exists(userId);

    if (!exists) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    return this.userRolesRepository
      .find({

        where: {
          userId,
        },

        relations: {
          role: true,
        },

        order: {
          fechaAsignacion:
            'DESC',
        },
      });
  }

  async remove(
    userId: string,
    roleId: string,
  ): Promise<void> {

    const result =
      await this.userRolesRepository
        .delete({
          userId,
          roleId,
        });

    if (!result.affected) {

      throw new NotFoundException(
        'La asignación usuario-rol no existe',
      );
    }
  }
}
```
2. __UserRolesController__
```
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  Throttle,
} from '@nestjs/throttler';

import {
  CreateUserRoleDto,
} from './dto/create-user-role.dto.js';

import {
  UserRolesService,
} from './user-roles.service.js';

@Controller('user-roles')
export class UserRolesController {

  constructor(
    private readonly userRolesService:
      UserRolesService,
  ) {}

  @Post()
  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  create(
    @Body()
    dto: CreateUserRoleDto,
  ) {

    return this.userRolesService
      .create(dto);
  }

  @Get('user/:userId')
  findByUser(

    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,

  ) {

    return this.userRolesService
      .findByUser(userId);
  }

  @Delete(':userId/:roleId')
  @HttpCode(
    HttpStatus.NO_CONTENT,
  )
  async remove(

    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,

    @Param(
      'roleId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    roleId: string,

  ): Promise<void> {

    await this.userRolesService
      .remove(
        userId,
        roleId,
      );
  }
}
```
3. __UserRolesModule__
```
import {
  Module,
} from '@nestjs/common';

import {
  TypeOrmModule,
} from '@nestjs/typeorm';

import {
  RolesModule,
} from '../roles/roles.module.js';

import {
  UsersModule,
} from '../users/users.module.js';

import {
  UserRole,
} from './entities/user-role.entity.js';

import {
  UserRolesController,
} from './user-roles.controller.js';

import {
  UserRolesService,
} from './user-roles.service.js';

@Module({

  imports: [

    TypeOrmModule.forFeature([
      UserRole,
    ]),

    UsersModule,
    RolesModule,
  ],

  controllers: [
    UserRolesController,
  ],

  providers: [
    UserRolesService,
  ],
})
export class UserRolesModule {}
```

## Rate limiting global
Nest proporciona `@nestjs/throttler`; actualmente el ttl se expresa en milisegundos, el guard puede configurarse globalmente con `APP_GUARD`, y `@Throttle()` permite endurecer endpoints específicos. 

Configuraremos:

`100 solicitudes / minuto / cliente`

y límites más restrictivos para operaciones de creación/modificación.

## AppModule completo

`src/app.module.ts`

```
import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import {
  APP_GUARD,
} from '@nestjs/core';

import {
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';

import {
  TypeOrmModule,
} from '@nestjs/typeorm';

import {
  RequestIdMiddleware,
} from './common/middleware/request-id.middleware.js';

import {
  envSchema,
} from './config/env.schema.js';

import {
  RolesModule,
} from './roles/roles.module.js';

import {
  UserRolesModule,
} from './user-roles/user-roles.module.js';

import {
  UsersModule,
} from './users/users.module.js';

@Module({

  imports: [

    ConfigModule.forRoot({

      isGlobal: true,

      cache: true,

      validationSchema:
        envSchema,
    }),

    TypeOrmModule.forRootAsync({

      inject: [
        ConfigService,
      ],

      useFactory:
        (
          config:
            ConfigService,
        ) => ({

          type:
            'postgres',

          host:
            config.getOrThrow<string>(
              'DB_HOST',
            ),

          port:
            Number(
              config.getOrThrow(
                'DB_PORT',
              ),
            ),

          username:
            config.getOrThrow<string>(
              'DB_USERNAME',
            ),

          password:
            config.getOrThrow<string>(
              'DB_PASSWORD',
            ),

          database:
            config.getOrThrow<string>(
              'DB_DATABASE',
            ),

          autoLoadEntities:
            true,

          /*
           * Secure by Design:
           * nunca modificar automáticamente
           * el esquema.
           */
          synchronize:
            false,

          retryAttempts:
            5,

          retryDelay:
            2000,

          logging: [
            'error',
          ],

          ssl:
            config.get<string>(
              'DB_SSL',
            ) === 'true'
              ? {
                  rejectUnauthorized:
                    true,
                }
              : false,

          extra: {
            max: 10,
            connectionTimeoutMillis:
              5000,
            idleTimeoutMillis:
              30000,
          },
        }),
    }),

    ThrottlerModule.forRootAsync({

      inject: [
        ConfigService,
      ],

      useFactory:
        (
          config:
            ConfigService,
        ) => [

          {
            ttl:
              Number(
                config.getOrThrow(
                  'RATE_LIMIT_TTL_MS',
                ),
              ),

            limit:
              Number(
                config.getOrThrow(
                  'RATE_LIMIT_MAX',
                ),
              ),

            blockDuration:
              Number(
                config.getOrThrow(
                  'RATE_LIMIT_BLOCK_MS',
                ),
              ),
          },
        ],
    }),

    UsersModule,
    RolesModule,
    UserRolesModule,
  ],

  providers: [

    {
      provide:
        APP_GUARD,

      useClass:
        ThrottlerGuard,
    },
  ],
})
export class AppModule
  implements NestModule {

  configure(
    consumer:
      MiddlewareConsumer,
  ) {

    consumer
      .apply(
        RequestIdMiddleware,
      )
      .forRoutes('*');
  }
}
```

## main.ts con seguridad global
La versión actual de Nest incorpora `useSecurityHeaders()` directamente; desde NestJS 12.1 puede proporcionar los encabezados de seguridad sin instalar Helmet aparte.

`src/main.ts`

```
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
} from './common/filters/all-exceptions.filter.js';

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
```

La configuración global:

```
whitelist: true
forbidNonWhitelisted: true
transform: true
```
está soportada expresamente por `ValidationPipe`: permite rechazar campos inesperados en lugar de dejarlos entrar silenciosamente a la aplicación.

## Configuración de TypeORM para migraciones

Crear:
`src/database/data-source.ts`

```
import 'dotenv/config';

import {
  DataSource,
} from 'typeorm';

import {
  Role,
} from '../roles/entities/role.entity.js';

import {
  UserRole,
} from '../user-roles/entities/user-role.entity.js';

import {
  User,
} from '../users/entities/user.entity.js';

function required(
  key: string,
): string {

  const value =
    process.env[key];

  if (!value) {
    throw new Error(
      `Variable requerida no definida: ${key}`,
    );
  }

  return value;
}

export default new DataSource({

  type:
    'postgres',

  host:
    required(
      'DB_HOST',
    ),

  port:
    Number(
      required(
        'DB_PORT',
      ),
    ),

  username:
    required(
      'DB_USERNAME',
    ),

  password:
    required(
      'DB_PASSWORD',
    ),

  database:
    required(
      'DB_DATABASE',
    ),

  entities: [
    User,
    Role,
    UserRole,
  ],

  migrations: [
    'dist/database/migrations/*.js',
  ],

  synchronize:
    false,

  logging: [
    'error',
  ],
});
```
## Levantar PostgreSQL
```
docker compose up -d postgres
```
Verificar:
```
docker compose ps
```

Logs:
```
docker compose logs -f postgres
```

Debemos tener:
```
users-postgres
healthy
```

## Generar migración inicial
Primero compilamos:
```
npm run build
```
Luego:
```
npx typeorm \
-d dist/database/data-source.js \
migration:generate \
src/database/migrations/InitialSchema
```

Volvemos a compilar:
```
npm run build
```
Ejecutamos:
```
npx typeorm \
-d dist/database/data-source.js \
migration:run
```

# Ejecutar User Service
```
npm run start:dev
```

Deberíamos obtener:
```
User Service:
http://localhost:3001/api/v1
```

Swagger:
```
http://localhost:3001/docs
```

## Testear la API

### Registrar un rol

[POST /api/v1/roles](http:localhost:3001//api/v1/roles)
```
POST /api/v1/roles
Content-Type: application/json

{
  "rol": "ADMIN",
  "estado": true
}
```
También:
```
{
  "rol": "CLIENTE",
  "estado": true
}
```
### Registrar usuario
```
POST /api/v1/users
Content-Type: application/json
```
```
{
  "cedula": "1712345678",
  "nombres": "Juan Carlos",
  "apellidos": "Pérez López",
  "fechaNacimiento": "1995-08-15",
  "username": "jperez",
  "email": "jperez@example.com",
  "password": "Clave-Segura-2026!",
  "estado": true
}
```

En PostgreSQL tendremos algo semejante a:
```
password
-------------------------------------------------------------
$argon2id$v=19$m=65536,t=3,p=4$....
```

Nunca:
```
Clave-Segura-2026!
```

#### Intento de Mass Assignment
Si un cliente intenta:
```
{
  "cedula": "1712345678",
  "nombres": "Juan",
  "apellidos": "Pérez",
  "fechaNacimiento": "1995-08-15",
  "username": "jperez",
  "email": "jperez@example.com",
  "password": "Clave-Segura-2026!",
  "esAdministrador": true,
  "saldo": 1000000
}
```
será rechazado debido a:
```
whitelist: true
forbidNonWhitelisted: true
```
Es decir, campos no declarados en el DTO no pasan silenciosamente a la capa de persistencia.

## Consultar usuarios paginados
`GET /api/v1/users?page=1&limit=20`
```
{
  "data": [
    {
      "id": "6cef586e-8aa3-4d8c-b8af-ccaa7366e086",
      "cedula": "1712345678",
      "nombres": "Juan Carlos",
      "apellidos": "Pérez López",
      "fechaNacimiento": "1995-08-15",
      "username": "jperez",
      "email": "jperez@example.com",
      "estado": true,
      "version": 1,
      "fechaCreacion": "2026-10-16T15:00:00.000Z",
      "fechaActualizacion": "2026-10-16T15:00:00.000Z",
      "fechaEliminacion": null,
      "userRoles": []
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```
Observe que password no aparece.

#### Buscar usuario por UUID
`GET /api/v1/users/{UUID}`

Un valor como: `123`, ni siquiera llega al servicio porque: `ParseUUIDPipe` lo rechaza previamente.

#### Buscar por cédula
`GET /api/v1/users/cedula/1712345678`

El pipe impide: `17123abc` o `12345678901234567`antes de ejecutar la consulta.

#### Asignar un rol
```
POST /api/v1/user-roles
Content-Type: application/json
```
Payload - Json
```
{
  "userId": "6cef586e-8aa3-4d8c-b8af-ccaa7366e086",
  "roleId": "abb68180-d802-4ca3-b86f-d5f4732c76a5"
}
```
Si se intenta asignar dos veces: `user_id + role_id`, PostgreSQL lo rechazará por la PK compuesta.

#### Consultar roles
`GET /api/v1/user-roles/user/6cef586e-8aa3-4d8c-b8af-ccaa7366e086`

#### Retirar rol
`DELETE /api/v1/user-roles/{userId}/{roleId}`

Respuesta: `204 No Content`

### Resumen endpoints
| Método | Endpoint | Función |
|---|---|---|
| `POST` | `/api/v1/users` | Crear usuario |
| `GET` | `/api/v1/users?page=1&limit=20` | Listar paginado |
| `GET` | `/api/v1/users/:id` | Consultar usuario |
| `GET` | `/api/v1/users/cedula/:cedula` | Consultar cédula |
| `PATCH` | `/api/v1/users/:id` | Actualizar usuario |
| `DELETE` | `/api/v1/users/:id` | Eliminación lógica |
| `POST` | `/api/v1/roles` | Crear rol |
| `GET` | `/api/v1/roles` | Listar roles |
| `GET` | `/api/v1/roles/:id` | Consultar rol |
| `PATCH` | `/api/v1/roles/:id` | Actualizar rol |
| `DELETE` | `/api/v1/roles/:id` | Eliminación lógica |
| `POST` | `/api/v1/user-roles` | Asignar rol |
| `GET` | `/api/v1/user-roles/user/:userId` | Roles del usuario |
| `DELETE` | `/api/v1/user-roles/:userId/:roleId` | Retirar rol |


#### Reglas de seguridad aplicadas
La seguridad se aplica bajo un enfoque de Secure by Design y defensa en profundidad. Esto significa que la protección no depende de un único control, sino de varias capas: entrada HTTP, validación, lógica de negocio, persistencia y base de datos.

| Mecanismo | Dónde se aplica | Objetivo principal | Riesgo que reduce |
|---|---|---|---|
| `ValidationPipe` | Entrada HTTP | Validar y filtrar datos | Datos malformados, Mass Assignment |
| `DTO + class-validator` | Entrada HTTP | Definir exactamente qué datos son válidos | Manipulación de parámetros |
| `whitelist` | Global | Eliminar/restringir propiedades no definidas | Mass Assignment |
| `forbidNonWhitelisted` | Global | Rechazar campos inesperados | Inyección de propiedades |
| `ParseUUIDPipe` | Parámetros URL | Validar UUID | Entradas inválidas |
| `CedulaPipe` | Parámetros URL | Validar cédula | Datos inconsistentes |
| `Rate Limiting` | API | Limitar solicitudes | DoS, abuso, automatización |
| `Argon2id` | Servicio | Proteger contraseñas | Robo de credenciales |
| `select:false` | Entidad | No recuperar hashes normalmente | Exposición de contraseña |
| `@Exclude()` | Serialización | Evitar retornar hashes | Fuga de información |
| `Security Headers` | HTTP | Endurecer respuestas HTTP | XSS, MIME sniffing, clickjacking |
| `CORS restrictivo` | HTTP | Restringir orígenes web | Acceso no deseado desde navegadores |
| `TypeORM` | Persistencia | Consultas parametrizadas | SQL Injection |
| `PK/FK/UNIQUE/CHECK` | PostgreSQL | Integridad de datos | Duplicados y datos inconsistentes |
| `Paginación limitada` | API | Limitar cantidad de datos | Agotamiento de recursos |
| `Soft Delete` | Persistencia | Eliminación lógica | Pérdida accidental de datos |
| `VersionColumn` | Persistencia | Control de concurrencia | Actualizaciones conflictivas |
| `Migraciones` | Base de datos | Cambios controlados del esquema | Cambios destructivos |
| `.env` | Configuración | Separar secretos del código | Exposición de credenciales |
| `Validación de .env` | Inicio de aplicación | Evitar configuración insegura | Errores de despliegue |
| `Request ID` | Observabilidad | Trazabilidad | Dificultad de auditoría |
| `Exception Filter` | API | Controlar errores retornados | Information Disclosure |
| `Swagger solo desarrollo` | API | Reducir exposición en producción | Reconocimiento de endpoints |
| `PostgreSQL en localhost` | Infraestructura | No exponer BD externamente | Acceso directo a PostgreSQL |