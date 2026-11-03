import { ApiProperty } from '@nestjs/swagger';
import type {
  ChannelEvidence,
  LsbIndicators,
  LsbReason,
  LsbStatus,
} from '../lsb/interfaces/lsb-result.js';
import { lsbResultSchema } from '../lsb/interfaces/lsb-result.schema.js';
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

export class AnalysisResultDto extends ImageMetadataDto {
  @ApiProperty({ enum: lsbResultSchema.shape.status.options })
  status!: LsbStatus;
  @ApiProperty({ enum: ['lsb_chi_square_v1'] })
  technique!: 'lsb_chi_square_v1';
  @ApiProperty({ enum: lsbResultSchema.shape.reason.options })
  reason!: LsbReason;
  @ApiProperty({ type: () => LsbIndicatorsDto })
  indicators!: LsbIndicators;
  @ApiProperty({ type: () => [ChannelEvidenceDto] })
  channels!: ChannelEvidence[];
  @ApiProperty({ type: [String] })
  limitations!: string[];
  @ApiProperty({ format: 'date-time' })
  analyzed_at!: string;
}
