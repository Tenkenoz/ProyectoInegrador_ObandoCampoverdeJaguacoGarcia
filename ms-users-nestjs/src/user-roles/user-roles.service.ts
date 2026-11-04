import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import type { AuditContext } from '../audit/audit.types.js';
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

    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateUserRoleDto, context: AuditContext = {}) {
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
        await this.auditService.record({
          eventType: 'user_role.assignment_denied',
          actorId: context.actorId ?? null,
          subjectId: dto.userId,
          action: 'user_role.assign',
          resourceId: null,
          decision: 'denied',
          reason: 'already_active',
          requestId: context.requestId ?? null,
        });

        throw new ConflictException('User already has this role');
      }

      existing.estado = true;

      const reactivated = await this.userRolesRepository.save(existing);

      await this.auditService.record({
        eventType: 'user_role.reactivated',
        actorId: context.actorId ?? null,
        subjectId: reactivated.userId,
        action: 'user_role.assign',
        resourceId: reactivated.id,
        decision: 'succeeded',
        reason: 'reactivated',
        requestId: context.requestId ?? null,
      });

      return reactivated;
    }

    const relation = this.userRolesRepository.create({
      userId: dto.userId,
      roleId: dto.roleId,
      estado: true,
    });

    try {
      const saved = await this.userRolesRepository.save(relation);

      await this.auditService.record({
        eventType: 'user_role.assigned',
        actorId: context.actorId ?? null,
        subjectId: saved.userId,
        action: 'user_role.assign',
        resourceId: saved.id,
        decision: 'succeeded',
        reason: 'active',
        requestId: context.requestId ?? null,
      });

      return saved;
    } catch (error) {
      if (isUniqueViolation(error)) {
        await this.auditService.record({
          eventType: 'user_role.assignment_denied',
          actorId: context.actorId ?? null,
          subjectId: dto.userId,
          action: 'user_role.assign',
          resourceId: null,
          decision: 'denied',
          reason: 'already_active',
          requestId: context.requestId ?? null,
        });

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

  async update(
    id: string,
    dto: UpdateUserRoleDto,
    context: AuditContext = {},
  ): Promise<UserRole> {
    const relation = await this.findOne(id);

    if (dto.estado !== undefined) {
      relation.estado = dto.estado;
    }

    const saved = await this.userRolesRepository.save(relation);

    await this.auditService.record({
      eventType: 'user_role.updated',
      actorId: context.actorId ?? null,
      subjectId: saved.userId,
      action: 'user_role.update',
      resourceId: saved.id,
      decision: 'succeeded',
      reason: saved.estado ? 'active' : 'inactive',
      requestId: context.requestId ?? null,
    });

    return saved;
  }

  async remove(id: string, context: AuditContext = {}): Promise<void> {
    const relation = await this.findOne(id);

    if (!relation.estado) {
      return;
    }

    relation.estado = false;

    const saved = await this.userRolesRepository.save(relation);

    await this.auditService.record({
      eventType: 'user_role.revoked',
      actorId: context.actorId ?? null,
      subjectId: saved.userId,
      action: 'user_role.revoke',
      resourceId: saved.id,
      decision: 'succeeded',
      reason: 'inactive',
      requestId: context.requestId ?? null,
    });
  }

  async removeByUserAndRole(
    userId: string,
    roleId: string,
    context: AuditContext = {},
  ): Promise<void> {
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

    const saved = await this.userRolesRepository.save(relation);

    await this.auditService.record({
      eventType: 'user_role.revoked',
      actorId: context.actorId ?? null,
      subjectId: saved.userId,
      action: 'user_role.revoke',
      resourceId: saved.id,
      decision: 'succeeded',
      reason: 'inactive',
      requestId: context.requestId ?? null,
    });
  }
}
