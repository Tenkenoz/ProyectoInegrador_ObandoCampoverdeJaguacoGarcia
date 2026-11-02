import { Transform } from 'class-transformer';

import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value, //Admin - ADMIN - admin
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  rol!: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
