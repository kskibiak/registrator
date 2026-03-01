import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EaktywniService, LoginResult } from '../eaktywni/eaktywni.service';
import { TasksService } from '../tasks/tasks.service';
import { UserEntity } from '../entities/user.entity';

export interface UserConfig {
  id: string;
  email: string;
  password: string;
  webUserIds: string;
  sessionToken?: string;
  tokenValidTo?: string;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  /** In-memory cache — keeps getById/getAll synchronous (safe for cron callers) */
  private users: UserConfig[] = [];

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
    private readonly eaktywniService: EaktywniService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
  ) {}

  async onModuleInit() {
    this.users = (await this.repo.find()) as UserConfig[];
    this.logger.log(`Loaded ${this.users.length} users from storage`);
  }

  getAll(): UserConfig[] {
    return this.users;
  }

  getById(id: string): UserConfig | undefined {
    return this.users.find((u) => u.id === id);
  }

  async addUser(email: string, password: string): Promise<UserConfig> {
    const loginResult = await this.eaktywniService.login(email, password);
    const userData = await this.eaktywniService.getUserData(loginResult.sessionToken);

    const user: UserConfig = {
      id: this.generateId(),
      email,
      password,
      webUserIds: `0,${userData.objectId}`,
      sessionToken: loginResult.sessionToken,
      tokenValidTo: loginResult.tokenValidTo,
    };

    await this.repo.save(user);
    this.users.push(user);
    this.logger.log(`Added user ${email} (id: ${user.id}, webUserIds: ${user.webUserIds})`);
    return user;
  }

  async updateUser(id: string, updates: { password?: string }): Promise<UserConfig> {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    const user = { ...this.users[idx] };

    if (updates.password !== undefined) {
      user.password = updates.password;
      const loginResult = await this.eaktywniService.login(user.email, user.password);
      user.sessionToken = loginResult.sessionToken;
      user.tokenValidTo = loginResult.tokenValidTo;
      const userData = await this.eaktywniService.getUserData(loginResult.sessionToken);
      user.webUserIds = `0,${userData.objectId}`;
    }

    await this.repo.save(user);
    this.users[idx] = user;
    this.logger.log(`Updated user ${user.email}`);
    return user;
  }

  async removeUser(id: string): Promise<boolean> {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;

    const removedCount = await this.tasksService.removeTasksByUser(id);
    this.logger.log(`Cascade deleted ${removedCount} tasks for user ${id}`);

    await this.repo.delete(id);
    this.users.splice(idx, 1);
    return true;
  }

  async refreshToken(userId: string): Promise<LoginResult> {
    const idx = this.users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error('User not found');
    const user = { ...this.users[idx] };

    const loginResult = await this.eaktywniService.login(user.email, user.password);
    user.sessionToken = loginResult.sessionToken;
    user.tokenValidTo = loginResult.tokenValidTo;

    try {
      const userData = await this.eaktywniService.getUserData(loginResult.sessionToken);
      user.webUserIds = `0,${userData.objectId}`;
    } catch (e) {
      this.logger.warn(`Could not fetch user data for ${user.email}: ${e.message}`);
    }

    await this.repo.save(user);
    this.users[idx] = user;
    return loginResult;
  }

  async ensureValidToken(userId: string, force = false): Promise<string> {
    const user = this.getById(userId);
    if (!user) throw new Error('User not found');

    if (!force && user.tokenValidTo && user.sessionToken) {
      if (new Date(user.tokenValidTo).getTime() - Date.now() > 5 * 60 * 1000) {
        return user.sessionToken;
      }
    }

    this.logger.log(`${force ? 'Force-refreshing' : 'Refreshing'} token for ${user.email}`);
    const result = await this.refreshToken(userId);
    return result.sessionToken;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoRefreshAllTokens() {
    if (this.users.length === 0) return;
    for (const user of [...this.users]) {
      try {
        if (!user.tokenValidTo || !user.sessionToken) {
          await this.refreshToken(user.id);
          continue;
        }
        const minutesLeft = (new Date(user.tokenValidTo).getTime() - Date.now()) / 60_000;
        if (minutesLeft < 10) {
          this.logger.log(`Token for ${user.email} expires in ${Math.round(minutesLeft)}min — refreshing`);
          await this.refreshToken(user.id);
        }
      } catch (e) {
        this.logger.error(`Auto-refresh failed for ${user.email}: ${e.message}`);
      }
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
