import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { UserRole } from '../../user-roles/entities/user-role.entity.js';
import type { RoleName } from '../role.constants.js';

@Entity({
  name: 'roles',
})
@Check('CHK_roles_rol', `"rol" IN ('ADMIN', 'ANALYST', 'USER')`)
@Index('UQ_roles_rol', ['rol'], {
  unique: true,
})
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  rol!: RoleName;

  @Column({
    type: 'boolean',
    default: true,
  })
  estado!: boolean;

  @VersionColumn({
    name: 'version',
  })
  version!: number;

  @CreateDateColumn({
    name: 'fecha_creacion',
    type: 'timestamp',
  })
  fechaCreacion!: Date;

  @UpdateDateColumn({
    name: 'fecha_actualizacion',
    type: 'timestamp',
  })
  fechaActualizacion!: Date;

  @DeleteDateColumn({
    name: 'fecha_eliminacion',
    type: 'timestamp',
    nullable: true,
  })
  fechaEliminacion!: Date | null;

  @OneToMany(() => UserRole, (userRole) => userRole.role)
  userRoles!: Relation<UserRole[]>;
}
