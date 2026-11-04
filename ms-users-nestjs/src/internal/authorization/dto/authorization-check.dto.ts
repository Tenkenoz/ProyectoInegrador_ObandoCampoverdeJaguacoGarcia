import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  AUTHORIZATION_ACTIONS,
  type AuthorizationAction,
} from '../../../authorization/authorization.types.js';

export class AuthorizationCheckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  subject_token!: string;

  @IsIn(AUTHORIZATION_ACTIONS)
  action!: AuthorizationAction;

  @IsOptional()
  @IsUUID('4')
  resource_id?: string | null;
}
