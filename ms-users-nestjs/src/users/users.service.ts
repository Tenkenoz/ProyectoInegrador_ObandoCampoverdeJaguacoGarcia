import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto/pagination-query.dto.js';

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as {
    code?: string;
  };

  return driverError?.code === '23505';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    //0603977224
    const { password, ...data } = dto;

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    const user = this.usersRepository.create({
      ...data,
      passwordHash,
    });

    try {
      const saved = await this.usersRepository.save(user);
      return this.findOne(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Los datos del usuario entran en conflicto con un registro existente',
        );
      }
      throw error;
    }
  }

  async findAll(pagination: PaginationQueryDto) {
    const { page, limit } = pagination;

    const [data, total] = await this.usersRepository.findAndCount({
      relations: {
        userRoles: {
          role: true,
        },
      },

      skip: (page - 1) * limit,

      take: limit,

      order: {
        fechaCreacion: 'DESC',
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

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
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
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async findByCedula(cedula: string): Promise<User> {
    const user = await this.usersRepository.findOne({
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
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async exists(id: string): Promise<boolean> {
    return this.usersRepository.exists({
      where: {
        id,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOneBy({
      id,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const { password, ...data } = dto;

    Object.assign(user, data);

    if (password) {
      user.passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
    }

    try {
      await this.usersRepository.save(user);
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

  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.softDelete(id);
    if (!result.affected) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }

  async findForAuthentication(identifier: string): Promise<User | null> {
    const normalized = identifier.trim().toLowerCase();

    return (
      this.usersRepository
        .createQueryBuilder('user')

        /*
         * passwordHash tiene:
         *
         * select: false
         *
         * por eso se solicita explícitamente.
         */
        .addSelect('user.passwordHash')

        .where(
          `
        (
          LOWER(user.username) = :identifier
          OR
          LOWER(user.email) = :identifier
        )
      `,
          {
            identifier: normalized,
          },
        )

        .andWhere('user.estado = :estado', {
          estado: true,
        })

        .andWhere('user.fechaEliminacion IS NULL')

        .getOne()
    );
  }

  async findActiveWithRoles(id: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')

      .leftJoinAndSelect(
        'user.userRoles',
        'userRole',
        `
        userRole.estado = :userRoleActive
      `,
        {
          userRoleActive: true,
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
          roleActive: true,
        },
      )

      .where('user.id = :id', {
        id,
      })

      .andWhere('user.estado = :userActive', {
        userActive: true,
      })

      .andWhere('user.fechaEliminacion IS NULL')

      .getOne();
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    const result = await this.usersRepository.increment(
      {
        id: userId,

        estado: true,

        fechaEliminacion: IsNull(),
      },
      'tokenVersion',
      1,
    );

    if (!result.affected) {
      throw new NotFoundException('Usuario no encontrado');
    }
  }
}
