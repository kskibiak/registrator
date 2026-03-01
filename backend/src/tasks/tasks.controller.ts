import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TasksService, TaskDefinition, TaskLog } from './tasks.service';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getAll(): TaskDefinition[] {
    return this.tasksService.getAll();
  }

  @Get('user/:userId')
  getByUser(@Param('userId') userId: string): TaskDefinition[] {
    return this.tasksService.getByUser(userId);
  }

  @Post()
  async addTask(
    @Body()
    body: {
      userId: string;
      exerciseName: string;
      dayOfWeek: string;
      time: string;
    },
  ): Promise<TaskDefinition> {
    try {
      return await this.tasksService.addTask(
        body.userId,
        body.exerciseName,
        body.dayOfWeek,
        body.time,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':taskId')
  async removeTask(@Param('taskId') taskId: string) {
    const removed = await this.tasksService.removeTask(taskId);
    if (!removed) {
      throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  @Patch(':taskId/toggle')
  async toggleTask(@Param('taskId') taskId: string) {
    const task = await this.tasksService.toggleTask(taskId);
    if (!task) {
      throw new HttpException('Task not found', HttpStatus.NOT_FOUND);
    }
    return task;
  }

  @Get('logs')
  async getLogs(
    @Query('taskId') taskId?: string,
    @Query('limit') limit?: string,
  ): Promise<TaskLog[]> {
    return this.tasksService.getLogs(taskId, limit ? parseInt(limit, 10) : 50);
  }

  @Get('logs/user/:userId')
  async getLogsByUser(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ): Promise<TaskLog[]> {
    return this.tasksService.getLogsByUser(
      userId,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get(':taskId/preview')
  async getTaskPreview(@Param('taskId') taskId: string) {
    try {
      return await this.tasksService.getTaskPreview(taskId);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
