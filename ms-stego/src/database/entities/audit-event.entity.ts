import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_events' })
@Index('IDX_audit_events_request_created', ['requestId', 'createdAt'])
@Check(
  'audit_events_outcome_check',
  "outcome IN ('allowed', 'denied', 'failed')",
)
@Check(
  'audit_events_http_status_check',
  'http_status IS NULL OR http_status BETWEEN 100 AND 599',
)
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;
  @Column({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId!: string | null;
  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;
  @Column({ type: 'varchar', length: 64 })
  event!: string;
  @Column({ type: 'varchar', length: 64, nullable: true })
  action!: string | null;
  @Column({ type: 'varchar', length: 8 })
  outcome!: 'allowed' | 'denied' | 'failed';
  @Column({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus!: number | null;
  @Column({ type: 'jsonb' })
  details!: Record<string, string | number | boolean | null>;
}
