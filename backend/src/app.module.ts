import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { UserEntity } from './entities/user.entity';
import { TaskEntity } from './entities/task.entity';
import { TaskLogEntity } from './entities/task-log.entity';
import { SettingsEntity } from './entities/settings.entity';
import { EaktywniModule } from './eaktywni/eaktywni.module';
import { UsersModule } from './users/users.module';
import { TasksModule } from './tasks/tasks.module';
import { ExercisesModule } from './exercises/exercises.module';
import { SettingsModule } from './settings/settings.module';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'app.db');
const RESET_DB = process.env.RESET_DB === 'true';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: DB_PATH,
      entities: [UserEntity, TaskEntity, TaskLogEntity, SettingsEntity],
      // dropSchema destroys all data — only when RESET_DB=true
      dropSchema: RESET_DB,
      // synchronize auto-creates/updates tables on startup (safe — never drops existing columns)
      synchronize: true,
    }),
    SettingsModule,
    EaktywniModule,
    UsersModule,
    TasksModule,
    ExercisesModule,
  ],
})
export class AppModule {}

