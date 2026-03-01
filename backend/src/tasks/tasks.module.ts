import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { UsersModule } from '../users/users.module';
import { TaskEntity } from '../entities/task.entity';
import { TaskLogEntity } from '../entities/task-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskEntity, TaskLogEntity]),
    forwardRef(() => UsersModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
