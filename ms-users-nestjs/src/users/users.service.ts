import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PasswordHasher } from '../common/security/password-hasher.service.js';
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

    private readonly passwordHasher: PasswordHasher,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const { password, ...data } = dto;

    const passwordHash = await this.passwordHasher.hash(password);

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
          'User data conflicts with an existing record',
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
      throw new NotFoundException('User not found');
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
      throw new NotFoundException('User not found');
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
      throw new NotFoundException('User not found');
    }

    const { password, ...data } = dto;

    Object.assign(user, data);

    if (password) {
      user.passwordHash = await this.passwordHasher.hash(password);
    }

    try {
      await this.usersRepository.save(user);
      return this.findOne(id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'User data conflicts with an existing record',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.softDelete(id);
    if (!result.affected) {
      throw new NotFoundException('User not found');
    }
  }

  async findForAuthentication(identifier: string): Promise<User | null> {
    const normalized = identifier.trim().toLowerCase();

    return (
      this.usersRepository
        .createQueryBuilder('user')

        /*
         * passwordHash is configured with:
         *
         * select: false
         *
         * so it must be requested explicitly.
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
      throw new NotFoundException('User not found');
    }
  }
}
