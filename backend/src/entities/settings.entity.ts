import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('settings')
export class SettingsEntity {
  @PrimaryColumn()
  key: string;

  @Column('text')
  value: string;
}
