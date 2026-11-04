import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AuditDecision } from '../audit.types.js';

@Entity({
  name: 'audit_events',
})
@Index('IDX_audit_events_occurred_at', ['occurredAt'])
@Index('IDX_audit_events_actor', ['actorId'])
@Index('IDX_audit_events_subject', ['subjectId'])
@Index('IDX_audit_events_event_type', ['eventType'])
@Index('IDX_audit_events_request_id', ['requestId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({
    name: 'occurred_at',
    type: 'timestamp',
  })
  occurredAt!: Date;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 64,
  })
  eventType!: string;

  @Column({
    name: 'actor_id',
    type: 'uuid',
    nullable: true,
  })
  actorId!: string | null;

  @Column({
    name: 'subject_id',
    type: 'uuid',
    nullable: true,
  })
  subjectId!: string | null;

  @Column({
    type: 'varchar',
    length: 128,
  })
  action!: string;

  @Column({
    name: 'resource_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  resourceId!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  decision!: AuditDecision | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  reason!: string | null;

  @Column({
    name: 'request_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  requestId!: string | null;
}
