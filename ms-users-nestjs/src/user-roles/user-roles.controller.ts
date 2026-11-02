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

import { Throttle } from '@nestjs/throttler';
import { CreateUserRoleDto } from './dto/create-user-role.dto.js';
import { UserRolesService } from './user-roles.service.js';
import { Roles } from '../auth/decorators/roles/roles.decorator.js';

@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

  @Post()
  @Roles('ADMIN')
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

  @Get('user/:userId')
  @Roles('ADMIN', 'OPERADOR')
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

  @Delete(':userId/:roleId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
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
    await this.userRolesService.remove(userId, roleId);
  }
}
