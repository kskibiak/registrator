import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('task_logs')
@Index(['taskId'])
export class TaskLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  taskId: string;

  @Column()
  exerciseId: number;

  @Column()
  exerciseName: string;

  @Column()
  date: string;

  @Column()
  status: string;

  @Column('text')
  message: string;

  @Column()
  timestamp: string;

  @Column({ type: 'text', nullable: true })
  request: string | null;

  @Column({ type: 'text', nullable: true })
  response: string | null;
}
