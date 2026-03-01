import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('tasks')
export class TaskEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  exerciseName: string;

  @Column()
  dayOfWeek: string;

  @Column()
  time: string;

  @Column({ default: true })
  enabled: boolean;

  @Column()
  createdAt: string;

  @Column({ default: 'active' })
  status: 'active' | 'completed' | 'failed';

  @Column({ type: 'text', nullable: true })
  nextTrigger: string | null;

  @Column({ type: 'text', nullable: true })
  lastAttempt: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'text', nullable: true })
  completedAt: string | null;
}
