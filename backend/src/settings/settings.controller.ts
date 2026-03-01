import {
  Controller,
  Get,
  Patch,
  Body,
} from '@nestjs/common';
import { SettingsService, AppSettings } from './settings.service';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll(): AppSettings {
    return this.settingsService.getAll();
  }

  @Patch()
  async update(@Body() body: Partial<AppSettings>): Promise<AppSettings> {
    return this.settingsService.update(body);
  }
}
