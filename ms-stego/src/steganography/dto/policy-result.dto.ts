import { ApiProperty } from '@nestjs/swagger';
import type {
  AppliedPolicy,
  PolicyAction,
} from '../policy/interfaces/applied-policy.js';

export class PolicySettingsDto {
  @ApiProperty({ enum: ['advertencia', 'cuarentena', 'rechazo'] })
  suspicious_action!: PolicyAction;
  @ApiProperty({ enum: ['advertencia', 'cuarentena', 'rechazo'] })
  inconclusive_action!: PolicyAction;
}

export class PolicyResultDto implements AppliedPolicy {
  @ApiProperty({ enum: ['stego_policy_v1'] })
  version!: 'stego_policy_v1';
  @ApiProperty({ enum: ['advertencia', 'cuarentena', 'rechazo'] })
  action!: PolicyAction;
  @ApiProperty()
  reason!: string;
  @ApiProperty({ type: 'number', nullable: true })
  retention_seconds!: number | null;
  @ApiProperty({ type: () => PolicySettingsDto })
  settings!: AppliedPolicy['settings'];
}

export class QuarantineResultDto {
  @ApiProperty({ enum: ['none', 'stored', 'deleted', 'missing'] })
  state!: 'none' | 'stored' | 'deleted' | 'missing';
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  expires_at!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  deleted_at!: string | null;
}
