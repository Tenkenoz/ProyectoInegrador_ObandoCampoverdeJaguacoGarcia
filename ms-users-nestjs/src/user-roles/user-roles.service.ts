import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { QueryFailedError, Repository } from 'typeorm';

import { RolesService } from '../roles/roles.service.js';

import { UsersService } from '../users/users.service.js';

import { CreateUserRoleDto } from './dto/create-user-role.dto.js';

import { UserRole } from './entities/user-role.entity.js';

@Injectable()
export class UserRolesService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRolesRepository: Repository<UserRole>,

    private readonly usersService: UsersService,

    private readonly rolesService: RolesService,
  ) {}

  async create(dto: CreateUserRoleDto) {
    const [userExists, roleExists] = await Promise.all([
      this.usersService.exists(dto.userId),

      this.rolesService.exists(dto.roleId),
    ]);

    if (!userExists) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!roleExists) {
      throw new NotFoundException('Rol no encontrado');
    }

    const relation = this.userRolesRepository.create(dto);

    try {
      return await this.userRolesRepository.save(relation);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (
          error.driverError as {
            code?: string;
          }
        )?.code === '23505'
      ) {
        throw new ConflictException('El usuario ya posee este rol');
      }

      throw error;
    }
  }

  async findByUser(userId: string) {
    const exists = await this.usersService.exists(userId);

    if (!exists) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.userRolesRepository.find({
      where: {
        userId,
      },

      relations: {
        role: true,
      },

      order: {
        fechaAsignacion: 'DESC',
      },
    });
  }

  async remove(userId: string, roleId: string): Promise<void> {
    const result = await this.userRolesRepository.delete({
      userId,
      roleId,
    });

    if (!result.affected) {
      throw new NotFoundException('La asignación usuario-rol no existe');
    }
  }
}
