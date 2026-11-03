import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLE_NAMES, type RoleName } from '../role.constants.js';

export class CreateRoleDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @IsIn(ROLE_NAMES, {
    message: `Role must be one of: ${ROLE_NAMES.join(', ')}`,
  })
  rol!: RoleName;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
