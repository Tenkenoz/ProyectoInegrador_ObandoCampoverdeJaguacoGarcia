import type { AnalysisMetadata } from '../../steganography/interfaces/analysis-metadata.js';
import type { AppliedPolicy } from '../../steganography/policy/interfaces/applied-policy.js';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AnalysisStatus =
  'sin_indicios' | 'sospechoso' | 'no_concluyente' | 'error';
export type AnalysisAction = 'advertencia' | 'cuarentena' | 'rechazo';

@Check('analyses_sha256_check', "sha256 ~ '^[0-9a-f]{64}$'")
@Check(
  'analyses_status_check',
  "status IN ('sin_indicios', 'sospechoso', 'no_concluyente', 'error')",
)
@Check(
  'analyses_action_check',
  "action IN ('advertencia', 'cuarentena', 'rechazo')",
)
@Check(
  'analyses_quarantine_state_check',
  "quarantine_state IN ('none', 'stored', 'deleted', 'missing')",
)
@Check(
  'analyses_quarantine_storage_check',
  "quarantine_state = 'none' OR (quarantine_key IS NOT NULL AND quarantine_expires_at IS NOT NULL)",
)
@Index('IDX_analyses_quarantine_expiry', [
  'quarantineState',
  'quarantineExpiresAt',
])
@Entity({ name: 'analyses' })
@Index('IDX_analyses_user_created', ['userId', 'createdAt'])
export class Analysis {
  @PrimaryGeneratedColumn('uuid', { name: 'analysis_id' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 64 })
  sha256!: string;

  @Column({ type: 'varchar', length: 100 })
  technique!: string;

  @Column({ type: 'jsonb' })
  indicators!: Record<string, number | null>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 20 })
  status!: AnalysisStatus;

  @Column({ type: 'varchar', length: 20 })
  action!: AnalysisAction;
  @Column({ type: 'jsonb', nullable: true })
  metadata!: AnalysisMetadata | null;
  @Column({ type: 'jsonb', nullable: true })
  policy!: AppliedPolicy | null;
  @Column({ name: 'quarantine_key', type: 'uuid', nullable: true })
  quarantineKey!: string | null;
  @Column({
    name: 'quarantine_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  quarantineExpiresAt!: Date | null;
  @Column({
    name: 'quarantine_deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  quarantineDeletedAt!: Date | null;
  @Column({
    name: 'quarantine_state',
    type: 'varchar',
    length: 8,
    default: 'none',
  })
  quarantineState!: 'none' | 'stored' | 'deleted' | 'missing';
}
