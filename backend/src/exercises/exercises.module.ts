import { Module } from '@nestjs/common';
import { ExercisesController } from './exercises.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [ExercisesController],
})
export class ExercisesModule {}
