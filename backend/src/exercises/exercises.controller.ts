import { Controller, Get, Query, Param, HttpException, HttpStatus } from '@nestjs/common';
import { EaktywniService, Exercise } from '../eaktywni/eaktywni.service';
import { UsersService } from '../users/users.service';

@Controller('api/exercises')
export class ExercisesController {
  constructor(
    private readonly eaktywniService: EaktywniService,
    private readonly usersService: UsersService,
  ) {}

  @Get(':userId')
  async getExercises(
    @Param('userId') userId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    try {
      const user = this.usersService.getById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const token = await this.usersService.ensureValidToken(userId);
      const exercises = await this.eaktywniService.getExercises(
        token,
        dateFrom,
        dateTo,
        user.webUserIds,
      );

      // Flatten and enrich the exercises
      const flatList: (Exercise & { day: string })[] = [];
      for (const [day, list] of Object.entries(exercises)) {
        for (const ex of list) {
          flatList.push({ ...ex, day });
        }
      }

      // Sort by start time
      flatList.sort((a, b) => a.startTime - b.startTime);

      return flatList;
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':userId/search')
  async searchExercises(
    @Param('userId') userId: string,
    @Query('name') name: string,
    @Query('dayOfWeek') dayOfWeek?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    try {
      const user = this.usersService.getById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Default to next 14 days
      const from = dateFrom || this.formatDate(new Date());
      const to = dateTo || this.formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

      const token = await this.usersService.ensureValidToken(userId);
      const exercises = await this.eaktywniService.getExercises(
        token,
        from,
        to,
        user.webUserIds,
      );

      const flatList: (Exercise & { day: string })[] = [];
      for (const [day, list] of Object.entries(exercises)) {
        for (const ex of list) {
          const nameMatch = !name || ex.name.toLowerCase().includes(name.toLowerCase());
          const dayMatch = !dayOfWeek || ex.dayOfAWeek.toLowerCase().includes(dayOfWeek.toLowerCase());
          if (nameMatch && dayMatch) {
            flatList.push({ ...ex, day });
          }
        }
      }

      flatList.sort((a, b) => a.startTime - b.startTime);
      return flatList;
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }
}
