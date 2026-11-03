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
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RolesService } from './roles.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto.js';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';
import { ROLE_ADMIN } from './role.constants.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Roles(ROLE_ADMIN)
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
    return this.rolesService.create(dto);
  }

  @Get()
  @Roles(ROLE_ADMIN)
  findAll(
    @Query()
    pagination: PaginationQueryDto,
  ) {
    return this.rolesService.findAll(pagination);
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
    return this.rolesService.findOne(id);
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
    dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
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
    await this.rolesService.remove(id);
  }
}
