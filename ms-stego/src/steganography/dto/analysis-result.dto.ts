import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type {
  ChannelEvidence,
  LsbIndicators,
  LsbReason,
  LsbStatus,
} from '../lsb/interfaces/lsb-result.js';
import { lsbResultSchema } from '../lsb/interfaces/lsb-result.schema.js';
import type { LsbConfiguration } from '../lsb/config/lsb.config.js';
import type {
  AppliedPolicy,
  PolicyAction,
} from '../policy/interfaces/applied-policy.js';
import { PolicyResultDto, QuarantineResultDto } from './policy-result.dto.js';
import { ImageMetadataDto } from './image-metadata.dto.js';

const nullableProbability = {
  type: 'number' as const,
  nullable: true,
  minimum: 0,
  maximum: 1,
};

export class LsbIndicatorsDto implements LsbIndicators {
  @ApiProperty({ type: 'number', nullable: true, minimum: 0 })
  chi_square!: number | null;
  @ApiProperty({ minimum: 0, maximum: 384 })
  degrees_of_freedom!: number;
  @ApiProperty(nullableProbability)
  p_value!: number | null;
  @ApiProperty({
    ...nullableProbability,
    description:
      'The upper-tail p-value used as a compatibility score, not a probability of hidden data.',
  })
  anomaly_score!: number | null;
  @ApiProperty(nullableProbability)
  lsb_ratio!: number | null;
  @ApiProperty()
  threshold!: number;
  @ApiProperty()
  clear_threshold!: number;
  @ApiProperty()
  balance_tolerance!: number;
  @ApiProperty()
  pixel_count!: number;
  @ApiProperty()
  sample_count!: number;
  @ApiProperty()
  coverage!: number;
}

export class ChannelEvidenceDto implements ChannelEvidence {
  @ApiProperty({ enum: ['red', 'green', 'blue'] })
  channel!: ChannelEvidence['channel'];
  @ApiProperty()
  sample_count!: number;
  @ApiProperty()
  eligible_pairs!: number;
  @ApiProperty()
  coverage!: number;
  @ApiProperty()
  chi_square!: number;
  @ApiProperty(nullableProbability)
  p_value!: number | null;
  @ApiProperty()
  lsb_ratio!: number;
}

@ApiExtraModels(LsbIndicatorsDto)
export class AnalysisResultDto extends ImageMetadataDto {
  @ApiProperty({ format: 'uuid' })
  analysis_id!: string;
  @ApiProperty({ enum: lsbResultSchema.shape.status.options })
  status!: LsbStatus;
  @ApiProperty()
  technique!: string;
  @ApiProperty({ enum: lsbResultSchema.shape.reason.options, nullable: true })
  reason!: LsbReason | null;
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(LsbIndicatorsDto) },
      {
        type: 'object',
        additionalProperties: { type: 'number', nullable: true },
      },
    ],
  })
  indicators!: LsbIndicators | Record<string, number | null>;
  @ApiProperty({ type: () => [ChannelEvidenceDto], nullable: true })
  channels!: ChannelEvidence[] | null;
  @ApiProperty({ type: [String], nullable: true })
  limitations!: string[] | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  analyzed_at!: string | null;
  @ApiProperty({ format: 'date-time' })
  created_at!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    nullable: true,
  })
  detector_parameters!: LsbConfiguration | null;
  @ApiProperty({ enum: ['advertencia', 'cuarentena', 'rechazo'] })
  action!: PolicyAction;
  @ApiProperty({ type: () => PolicyResultDto, nullable: true })
  policy!: AppliedPolicy | null;
  @ApiProperty({ type: () => QuarantineResultDto })
  quarantine!: QuarantineResultDto;
  @ApiProperty()
  legacy!: boolean;
}
