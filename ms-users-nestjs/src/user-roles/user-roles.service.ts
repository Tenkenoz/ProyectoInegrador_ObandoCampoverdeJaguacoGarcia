import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';

import { RolesService } from '../roles/roles.service.js';

import { UsersService } from '../users/users.service.js';

import { CreateUserRoleDto } from './dto/create-user-role.dto.js';

import { ListUserRolesQueryDto } from './dto/list-user-roles-query.dto.js';

import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';

import { UserRole } from './entities/user-role.entity.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (
      error.driverError as {
        code?: string;
      }
    )?.code === '23505'
  );
}

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
      throw new NotFoundException('User not found');
    }

    if (!roleExists) {
      throw new NotFoundException('Role not found');
    }

    const existing = await this.userRolesRepository.findOne({
      where: {
        userId: dto.userId,
        roleId: dto.roleId,
      },

      relations: {
        role: true,
      },
    });

    if (existing) {
      if (existing.estado) {
        throw new ConflictException('User already has this role');
      }

      existing.estado = true;

      return this.userRolesRepository.save(existing);
    }

    const relation = this.userRolesRepository.create({
      userId: dto.userId,
      roleId: dto.roleId,
      estado: true,
    });

    try {
      return await this.userRolesRepository.save(relation);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('User already has this role');
      }

      throw error;
    }
  }

  async findAll(query: ListUserRolesQueryDto) {
    const { page, limit, userId, roleId, estado } = query;

    const where: FindOptionsWhere<UserRole> = {};

    if (userId) {
      where.userId = userId;
    }

    if (roleId) {
      where.roleId = roleId;
    }

    if (estado !== undefined) {
      where.estado = estado;
    }

    const [data, total] = await this.userRolesRepository.findAndCount({
      where,

      relations: {
        user: true,
        role: true,
      },

      skip: (page - 1) * limit,

      take: limit,

      order: {
        fechaAsignacion: 'DESC',
      },
    });

    return {
      data,

      meta: {
        page,
        limit,
        total,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUser(userId: string) {
    const exists = await this.usersService.exists(userId);

    if (!exists) {
      throw new NotFoundException('User not found');
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

  async findOne(id: string): Promise<UserRole> {
    const relation = await this.userRolesRepository.findOne({
      where: {
        id,
      },

      relations: {
        user: true,
        role: true,
      },
    });

    if (!relation) {
      throw new NotFoundException('User-role assignment does not exist');
    }

    return relation;
  }

  async update(id: string, dto: UpdateUserRoleDto): Promise<UserRole> {
    const relation = await this.findOne(id);

    if (dto.estado !== undefined) {
      relation.estado = dto.estado;
    }

    return this.userRolesRepository.save(relation);
  }

  async remove(id: string): Promise<void> {
    const relation = await this.findOne(id);

    if (!relation.estado) {
      return;
    }

    relation.estado = false;

    await this.userRolesRepository.save(relation);
  }

  async removeByUserAndRole(userId: string, roleId: string): Promise<void> {
    const relation = await this.userRolesRepository.findOne({
      where: {
        userId,
        roleId,
      },
    });

    if (!relation) {
      throw new NotFoundException('User-role assignment does not exist');
    }

    if (!relation.estado) {
      return;
    }

    relation.estado = false;

    await this.userRolesRepository.save(relation);
  }
}
