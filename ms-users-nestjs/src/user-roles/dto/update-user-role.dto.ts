import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserRoleDto {
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
