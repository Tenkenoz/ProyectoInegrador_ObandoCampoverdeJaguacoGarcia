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

import { Throttle } from '@nestjs/throttler';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';
import { CedulaPipe } from '../common/pipes/cedula/cedula.pipe.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto.js';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';
import { ROLE_ADMIN } from '../roles/role.constants.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(ROLE_ADMIN)
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
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(ROLE_ADMIN)
  findAll(
    @Query()
    pagination: PaginationQueryDto,
  ) {
    return this.usersService.findAll(pagination);
  }

  @Get('cedula/:cedula')
  @Roles(ROLE_ADMIN)
  findByCedula(
    @Param('cedula', CedulaPipe)
    cedula: string,
  ) {
    return this.usersService.findByCedula(cedula);
  }

  @Get(':id')
  @Roles(ROLE_ADMIN)
  findOne(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(ROLE_ADMIN)
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
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ): Promise<void> {
    await this.usersService.remove(id);
  }
}
