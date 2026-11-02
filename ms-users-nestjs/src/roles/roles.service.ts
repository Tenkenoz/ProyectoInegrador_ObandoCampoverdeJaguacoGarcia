import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { QueryFailedError, Repository } from 'typeorm';

import { CreateRoleDto } from './dto/create-role.dto.js';

import { UpdateRoleDto } from './dto/update-role.dto.js';

import { Role } from './entities/role.entity.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto.js';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
  ) {}

  async create(dto: CreateRoleDto): Promise<Role> {
    const role = this.rolesRepository.create(dto);

    try {
      return await this.rolesRepository.save(role);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (
          error.driverError as {
            code?: string;
          }
        )?.code === '23505'
      ) {
        throw new ConflictException('El rol ya existe');
      }

      throw error;
    }
  }

  async findAll(pagination: PaginationQueryDto) {
    const { page, limit } = pagination;

    const [data, total] = await this.rolesRepository.findAndCount({
      skip: (page - 1) * limit,

      take: limit,

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

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.rolesRepository.findOneBy({
      id,
    });

    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    return role;
  }

  async exists(id: string): Promise<boolean> {
    return this.rolesRepository.exists({
      where: {
        id,
      },
    });
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    Object.assign(role, dto);

    try {
      return await this.rolesRepository.save(role);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (
          error.driverError as {
            code?: string;
          }
        )?.code === '23505'
      ) {
        throw new ConflictException('El rol ya existe');
      }

      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.rolesRepository.softDelete(id);

    if (!result.affected) {
      throw new NotFoundException('Rol no encontrado');
    }
  }
}
