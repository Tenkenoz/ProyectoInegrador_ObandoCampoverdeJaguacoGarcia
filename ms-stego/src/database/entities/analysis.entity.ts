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
@Entity({ name: 'analyses' })
@Index('IDX_analyses_user_created', ['userId', 'createdAt'])
export class Analysis {
  @PrimaryGeneratedColumn('uuid', { name: 'analysis_id' })
  id!: string;

  // External identity reference: STEGO does not access AUTH tables.
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 64 })
  sha256!: string;

  @Column({ type: 'varchar', length: 100 })
  technique!: string;

  @Column({ type: 'jsonb' })
  indicators!: Record<string, number>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'varchar', length: 20 })
  status!: AnalysisStatus;

  @Column({ type: 'varchar', length: 20 })
  action!: AnalysisAction;
}
