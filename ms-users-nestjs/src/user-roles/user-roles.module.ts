import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module.js';
import { RolesModule } from '../roles/roles.module.js';

import { UsersModule } from '../users/users.module.js';

import { UserRole } from './entities/user-role.entity.js';

import { UserRolesController } from './user-roles.controller.js';

import { UserRolesService } from './user-roles.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserRole]),
    UsersModule,
    RolesModule,
    AuditModule,
  ],

  controllers: [UserRolesController],

  providers: [UserRolesService],
})
export class UserRolesModule {}
