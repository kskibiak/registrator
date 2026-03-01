import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsEntity } from '../entities/settings.entity';

export interface AppSettings {
  retryIntervalSeconds: number;
}

const DEFAULTS: AppSettings = { retryIntervalSeconds: 30 };

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache: AppSettings = { ...DEFAULTS };

  constructor(
    @InjectRepository(SettingsEntity)
    private readonly repo: Repository<SettingsEntity>,
  ) {}

  async onModuleInit() {
    const row = await this.repo.findOneBy({ key: 'config' });
    if (row) {
      try {
        this.cache = { ...DEFAULTS, ...JSON.parse(row.value) };
      } catch {
        this.logger.warn('Could not parse settings, using defaults');
      }
    }
  }

  /** Synchronous read from in-memory cache — safe to call from cron */
  getAll(): AppSettings {
    return { ...this.cache };
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (partial.retryIntervalSeconds !== undefined) {
      this.cache.retryIntervalSeconds = Math.max(5, Math.min(3600, partial.retryIntervalSeconds));
    }
    await this.repo.save({ key: 'config', value: JSON.stringify(this.cache) });
    this.logger.log(`Settings updated: retryInterval=${this.cache.retryIntervalSeconds}s`);
    return { ...this.cache };
  }
}
