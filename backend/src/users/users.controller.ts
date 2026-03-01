import { Controller, Get, Post, Delete, Patch, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService, UserConfig } from './users.service';

/** Strip password before sending to client */
function sanitize(user: UserConfig) {
  const { password: _pw, ...safe } = user;
  return safe;
}

class AddUserDto {
  email: string;
  password: string;
}

class ResetPasswordDto {
  password: string;
}

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAll() {
    return this.usersService.getAll().map(sanitize);
  }

  @Post()
  async addUser(@Body() dto: AddUserDto) {
    try {
      return sanitize(await this.usersService.addUser(dto.email, dto.password));
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Patch(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    try {
      if (!dto.password) throw new Error('Nowe hasło nie może być puste');
      return sanitize(await this.usersService.updateUser(id, { password: dto.password }));
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
      await this.usersService.refreshToken(id);
      return { success: true };
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
