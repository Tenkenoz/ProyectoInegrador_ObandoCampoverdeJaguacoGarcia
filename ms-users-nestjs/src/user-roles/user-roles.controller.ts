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
import { Roles } from '../auth/decorators/roles/roles.decorator.js';
import { ROLE_ADMIN } from '../roles/role.constants.js';
import { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import { ListUserRolesQueryDto } from './dto/list-user-roles-query.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UserRolesService } from './user-roles.service.js';

@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

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
    dto: CreateUserRoleDto,
  ) {
    return this.userRolesService.create(dto);
  }

  @Get()
  @Roles(ROLE_ADMIN)
  findAll(
    @Query()
    query: ListUserRolesQueryDto,
  ) {
    return this.userRolesService.findAll(query);
  }

  @Get('user/:userId')
  @Roles(ROLE_ADMIN)
  findByUser(
    @Param(
      'userId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    userId: string,
  ) {
    return this.userRolesService.findByUser(userId);
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
    dto: UpdateUserRoleDto,
  ) {
    return this.userRolesService.update(id, dto);
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
    await this.userRolesService.remove(id);
  }

  @Delete(':userId/:roleId')
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeByUserAndRole(
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
    await this.userRolesService.removeByUserAndRole(userId, roleId);
  }
}
