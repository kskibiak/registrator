import { Controller, Get, Post, Delete, Patch, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';

class AddUserDto {
  email: string;
  password: string;
}

class UpdateUserDto {
  password?: string;
}

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAll() {
    return this.usersService.getAll();
  }

  @Post()
  async addUser(@Body() dto: AddUserDto) {
    try {
      return await this.usersService.addUser(dto.email, dto.password);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    try {
      return await this.usersService.updateUser(id, dto);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':id')
  async removeUser(@Param('id') id: string) {
    const removed = await this.usersService.removeUser(id);
    if (!removed) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return { success: true };
  }

  @Post(':id/refresh-token')
  async refreshToken(@Param('id') id: string) {
    try {
      return await this.usersService.refreshToken(id);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
