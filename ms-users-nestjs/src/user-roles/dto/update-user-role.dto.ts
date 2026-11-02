import { PartialType } from '@nestjs/swagger';
import { CreateUserRoleDto } from './create-user-role.dto.js';

export class UpdateUserRoleDto extends PartialType(CreateUserRoleDto) {}
