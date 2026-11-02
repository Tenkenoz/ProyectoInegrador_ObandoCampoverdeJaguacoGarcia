import {
  Transform,
} from 'class-transformer';

import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {

  @Transform(
    ({ value }) =>
      typeof value === 'string'
        ? value.trim().toLowerCase()
        : value,
  )
  @IsString()
  @MinLength(4)
  @MaxLength(150)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}