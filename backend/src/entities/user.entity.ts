import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: '0' })
  webUserIds: string;

  @Column({ type: 'text', nullable: true })
  sessionToken: string | null;

  @Column({ type: 'text', nullable: true })
  tokenValidTo: string | null;
}
