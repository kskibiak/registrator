import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EaktywniService, Exercise } from '../eaktywni/eaktywni.service';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { TaskEntity } from '../entities/task.entity';
import { TaskLogEntity } from '../entities/task-log.entity';

export interface TaskDefinition {
  id: string;
  userId: string;
  exerciseName: string;
  dayOfWeek: string;
  time: string;
  enabled: boolean;
  createdAt: string;
  status: 'active' | 'completed' | 'failed';
  nextTrigger?: string;
  lastAttempt?: string;
  lastError?: string;
  retryCount: number;
  completedAt?: string;
}

export interface TaskLog {
  taskId: string;
  exerciseId: number;
  exerciseName: string;
  date: string;
  status: 'success' | 'error' | 'already_assigned' | 'full' | 'not_open';
  message: string;
  timestamp: string;
  request?: any;
  response?: any;
}

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);
  /** In-memory cache for cron — avoids async DB reads every second */
  private tasks: TaskDefinition[] = [];
  private isRunning = false;

  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepo: Repository<TaskEntity>,
    @InjectRepository(TaskLogEntity)
    private readonly logRepo: Repository<TaskLogEntity>,
    private readonly eaktywniService: EaktywniService,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    this.tasks = (await this.taskRepo.find()) as TaskDefinition[];
    this.logger.log(`Loaded ${this.tasks.length} tasks`);
    await this.fixStaleTriggers();
  }

  // ── Persistence ──────────────────────────────────────────

  private entityToTask(e: TaskEntity): TaskDefinition {
    return {
      ...e,
      nextTrigger: e.nextTrigger ?? undefined,
      lastAttempt: e.lastAttempt ?? undefined,
      lastError: e.lastError ?? undefined,
      completedAt: e.completedAt ?? undefined,
    };
  }

  private async persistTask(task: TaskDefinition): Promise<void> {
    await this.taskRepo.save({
      ...task,
      nextTrigger: task.nextTrigger ?? null,
      lastAttempt: task.lastAttempt ?? null,
      lastError: task.lastError ?? null,
      completedAt: task.completedAt ?? null,
    });
  }

  private async persistAllTasks(): Promise<void> {
    await this.taskRepo.save(
      this.tasks.map((t) => ({
        ...t,
        nextTrigger: t.nextTrigger ?? null,
        lastAttempt: t.lastAttempt ?? null,
        lastError: t.lastError ?? null,
        completedAt: t.completedAt ?? null,
      })),
    );
  }

  private async fixStaleTriggers() {
    const nowIso = new Date().toISOString();
    let fixed = 0;
    for (const t of this.tasks) {
      if (!t.enabled || t.status === 'completed') continue;
      if (!t.nextTrigger || t.status === 'failed') {
        t.nextTrigger = nowIso;
        fixed++;
      }
    }
    if (fixed > 0) {
      await this.persistAllTasks();
      this.logger.log(`Reset nextTrigger for ${fixed} task(s)`);
    }
  }

  private async addLog(log: TaskLog): Promise<void> {
    await this.logRepo.save({
      taskId: log.taskId,
      exerciseId: log.exerciseId,
      exerciseName: log.exerciseName,
      date: log.date,
      status: log.status,
      message: log.message,
      timestamp: log.timestamp,
      request: log.request ? JSON.stringify(log.request) : null,
      response: log.response ? JSON.stringify(log.response) : null,
    });

    // Keep only last 500 logs per task
    const count = await this.logRepo.count({ where: { taskId: log.taskId } });
    if (count > 500) {
      const oldest = await this.logRepo.find({
        where: { taskId: log.taskId },
        order: { id: 'ASC' },
        take: count - 500,
      });
      if (oldest.length > 0) await this.logRepo.remove(oldest);
    }

    this.logger.log(`[${log.status}] Task ${log.taskId}: ${log.message}`);
  }

  // ── CRUD ──────────────────────────────────────────────────

  getAll(): TaskDefinition[] {
    return this.tasks;
  }

  getByUser(userId: string): TaskDefinition[] {
    return this.tasks.filter((t) => t.userId === userId);
  }

  getById(taskId: string): TaskDefinition | undefined {
    return this.tasks.find((t) => t.id === taskId);
  }

  async addTask(
    userId: string,
    exerciseName: string,
    dayOfWeek: string,
    time: string,
  ): Promise<TaskDefinition> {
    const user = this.usersService.getById(userId);
    if (!user) throw new Error('User not found');

    const retryMs = this.settingsService.getAll().retryIntervalSeconds * 1000;
    const task: TaskDefinition = {
      id: this.generateId(),
      userId,
      exerciseName,
      dayOfWeek,
      time,
      enabled: true,
      createdAt: new Date().toISOString(),
      status: 'active',
      retryCount: 0,
      nextTrigger: new Date(Date.now() + retryMs).toISOString(),
    };

    await this.persistTask(task);
    this.tasks.push(task);
    this.logger.log(`Added task: "${exerciseName}" on ${dayOfWeek} at ${time} for user ${user.email}`);
    return task;
  }

  async removeTask(taskId: string): Promise<boolean> {
    const idx = this.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    this.tasks.splice(idx, 1);
    await this.taskRepo.delete(taskId);
    await this.logRepo.delete({ taskId });
    return true;
  }

  async removeTasksByUser(userId: string): Promise<number> {
    const userTasks = this.tasks.filter((t) => t.userId === userId);
    if (userTasks.length === 0) return 0;

    const taskIds = userTasks.map((t) => t.id);
    this.tasks = this.tasks.filter((t) => t.userId !== userId);

    await this.taskRepo.delete({ userId });
    if (taskIds.length > 0) {
      await this.logRepo.delete({ taskId: In(taskIds) });
    }

    this.logger.log(`Removed ${userTasks.length} tasks and their logs for user ${userId}`);
    return userTasks.length;
  }

  async toggleTask(taskId: string): Promise<TaskDefinition | null> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    task.enabled = !task.enabled;
    if (task.enabled) {
      task.nextTrigger = new Date().toISOString();
      if (task.status === 'completed' || task.status === 'failed') {
        task.status = 'active';
        task.retryCount = 0;
        task.lastError = undefined;
      }
    }
    await this.persistTask(task);
    return task;
  }

  async getLogs(taskId?: string, limit = 50): Promise<TaskLog[]> {
    const rows = await this.logRepo.find({
      where: taskId ? { taskId } : undefined,
      order: { id: 'DESC' },
      take: limit,
    });
    return rows.reverse().map((r) => ({
      taskId: r.taskId,
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      date: r.date,
      status: r.status as TaskLog['status'],
      message: r.message,
      timestamp: r.timestamp,
      request: r.request ? JSON.parse(r.request) : undefined,
      response: r.response ? JSON.parse(r.response) : undefined,
    }));
  }

  async getLogsByUser(userId: string, limit = 100): Promise<TaskLog[]> {
    const userTaskIds = this.tasks.filter((t) => t.userId === userId).map((t) => t.id);
    if (userTaskIds.length === 0) return [];
    const rows = await this.logRepo.find({
      where: { taskId: In(userTaskIds) },
      order: { id: 'DESC' },
      take: limit,
    });
    return rows.reverse().map((r) => ({
      taskId: r.taskId,
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      date: r.date,
      status: r.status as TaskLog['status'],
      message: r.message,
      timestamp: r.timestamp,
      request: r.request ? JSON.parse(r.request) : undefined,
      response: r.response ? JSON.parse(r.response) : undefined,
    }));
  }

  async getTaskPreview(taskId: string): Promise<any> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found');

    const user = this.usersService.getById(task.userId);
    if (!user) throw new Error('User not found');

    let token: string;
    try {
      token = await this.usersService.ensureValidToken(task.userId);
    } catch (e) {
      return { task, user: { email: user.email, webUserIds: user.webUserIds }, error: `Nie udało się pobrać tokenu: ${e.message}`, matchedExercises: [], plannedRequests: [] };
    }

    const now = new Date();
    const dateFrom = this.formatDate(now);
    const dateTo = this.formatDate(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000));

    let allExercises: Record<string, Exercise[]>;
    try {
      allExercises = await this.eaktywniService.getExercises(token, dateFrom, dateTo, user.webUserIds);
    } catch (e) {
      return { task, user: { email: user.email, webUserIds: user.webUserIds }, token: token.substring(0, 8) + '...', error: `Nie udało się pobrać ćwiczeń: ${e.message}`, matchedExercises: [], plannedRequests: [] };
    }

    const matchedExercises: Exercise[] = [];
    const plannedRequests: any[] = [];
    const BASE_URL = 'https://api.eaktywni.pl/tt-admin//EAktywni';

    for (const [, exercises] of Object.entries(allExercises)) {
      for (const ex of exercises) {
        if (!this.matchesTask(ex, task)) continue;
        matchedExercises.push(ex);
        plannedRequests.push({
          url: `${BASE_URL}/exercises/fitness/entry?objectIds=1243&passIds=null`,
          method: 'POST',
          body: { exerciseIds: ex.objectId, webUserIds: user.webUserIds, assigned: false },
          exerciseInfo: {
            name: ex.name, day: ex.dayOfAWeek,
            startTime: new Date(ex.startTime).toISOString(),
            saleFrom: new Date(ex.saleFrom).toISOString(),
            saleTo: new Date(ex.saleTo).toISOString(),
            capacity: ex.capacity, reserved: ex.reserved, assigned: ex.assigned,
            registrationOpen: Date.now() >= ex.saleFrom && Date.now() <= ex.saleTo,
          },
        });
      }
    }

    return { task, user: { email: user.email, webUserIds: user.webUserIds }, token: token.substring(0, 8) + '...', matchedExercises: matchedExercises.length, plannedRequests };
  }

  // ── Schedule: runs every second ──────────────────────────

  @Cron(CronExpression.EVERY_SECOND)
  async handleCron() {
    if (this.isRunning) return;
    const now = Date.now();
    const dueTasks = this.tasks.filter((t) =>
      t.enabled && t.status !== 'completed' && t.nextTrigger && new Date(t.nextTrigger).getTime() <= now,
    );
    if (dueTasks.length === 0) return;
    this.isRunning = true;
    try {
      const tasksByUser = new Map<string, TaskDefinition[]>();
      for (const task of dueTasks) {
        const list = tasksByUser.get(task.userId) ?? [];
        list.push(task);
        tasksByUser.set(task.userId, list);
      }
      for (const [userId, userTasks] of tasksByUser) {
        await this.processUserTasks(userId, userTasks);
      }
    } catch (e) {
      this.logger.error(`Cron error: ${e.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async processUserTasks(userId: string, tasks: TaskDefinition[]) {
    const user = this.usersService.getById(userId);
    if (!user) return;

    let token: string;
    try {
      token = await this.usersService.ensureValidToken(userId);
    } catch (e) {
      this.logger.error(`Failed to get token for ${user.email}: ${e.message}`);
      return;
    }

    const now = new Date();
    const dateFrom = this.formatDate(now);
    const dateTo = this.formatDate(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000));

    let allExercises: Record<string, Exercise[]>;
    try {
      allExercises = await this.eaktywniService.getExercises(token, dateFrom, dateTo, user.webUserIds);
    } catch (e) {
      if (e.message?.includes('401') || e.response?.status === 401) {
        try {
          token = await this.usersService.ensureValidToken(userId, true);
          allExercises = await this.eaktywniService.getExercises(token, dateFrom, dateTo, user.webUserIds);
        } catch (e2) {
          this.logger.error(`Retry failed for ${user.email}: ${e2.message}`);
          return;
        }
      } else {
        this.logger.error(`Failed to fetch exercises for ${user.email}: ${e.message}`);
        return;
      }
    }

    const currentTime = Date.now();
    const retryMs = this.settingsService.getAll().retryIntervalSeconds * 1000;

    for (const task of tasks) {
      let earliestSaleFrom: number | null = null;
      let hadAttempt = false;

      for (const [, exercises] of Object.entries(allExercises)) {
        for (const ex of exercises) {
          if (!this.matchesTask(ex, task)) continue;

          if (ex.assigned) {
            if (task.status !== 'completed') {
              task.status = 'completed';
              task.completedAt = new Date().toISOString();
              task.enabled = false;
              task.retryCount = 0;
              await this.persistTask(task);
              await this.addLog({ taskId: task.id, exerciseId: ex.objectId, exerciseName: ex.name, date: this.formatDate(new Date(ex.startTime)), status: 'already_assigned', message: `Already registered for "${ex.name}" – task completed`, timestamp: new Date().toISOString() });
            }
            continue;
          }

          if (currentTime < ex.saleFrom) {
            if (earliestSaleFrom === null || ex.saleFrom < earliestSaleFrom) earliestSaleFrom = ex.saleFrom;
            const opensIn = ex.saleFrom - currentTime;
            if (opensIn <= 120_000 && opensIn > 0) {
              this.logger.log(`Registration for "${ex.name}" opens in ${Math.round(opensIn / 1000)}s — scheduling precise attempt`);
              this.scheduleAttempt(token, ex, user.webUserIds, task, ex.saleFrom);
            }
            continue;
          }

          if (currentTime > ex.saleTo) continue;

          if (ex.reserved >= ex.capacity && !ex.waitList) {
            await this.addLog({ taskId: task.id, exerciseId: ex.objectId, exerciseName: ex.name, date: this.formatDate(new Date(ex.startTime)), status: 'full', message: `Class "${ex.name}" is full (${ex.reserved}/${ex.capacity})`, timestamp: new Date().toISOString() });
            continue;
          }

          hadAttempt = true;
          await this.attemptRegistration(token, ex, user.webUserIds, task);
        }
      }

      if (task.status !== 'completed') {
        task.nextTrigger = (!hadAttempt && earliestSaleFrom !== null && currentTime < earliestSaleFrom)
          ? new Date(earliestSaleFrom).toISOString()
          : new Date(currentTime + retryMs).toISOString();
        await this.persistTask(task);
      }
    }
  }

  private matchesTask(exercise: Exercise, task: TaskDefinition): boolean {
    if (!exercise.name.toLowerCase().includes(task.exerciseName.toLowerCase())) return false;
    if (!exercise.dayOfAWeek.toLowerCase().includes(task.dayOfWeek.toLowerCase())) return false;
    const d = new Date(exercise.startTime);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}` === task.time;
  }

  private scheduleAttempt(token: string, exercise: Exercise, webUserIds: string, task: TaskDefinition, openTime: number) {
    const delay = Math.max(0, openTime - Date.now() + 500);
    setTimeout(async () => {
      try {
        const freshToken = await this.usersService.ensureValidToken(task.userId);
        await this.attemptRegistration(freshToken, exercise, webUserIds, task);
      } catch (e) {
        await this.addLog({ taskId: task.id, exerciseId: exercise.objectId, exerciseName: exercise.name, date: this.formatDate(new Date(exercise.startTime)), status: 'error', message: `Scheduled registration failed: ${e.message}`, timestamp: new Date().toISOString() });
      }
    }, delay);
  }

  private async attemptRegistration(token: string, exercise: Exercise, webUserIds: string, task: TaskDefinition, isRetry = false) {
    try {
      const { data: result, requestPayload } = await this.eaktywniService.registerForExercise(token, exercise.objectId, webUserIds);

      if (result.isError) {
        const errorMsg = result.errorTable.join(', ');
        if (!isRetry && errorMsg.includes('zalogowany')) {
          try {
            const freshToken = await this.usersService.ensureValidToken(task.userId, true);
            return this.attemptRegistration(freshToken, exercise, webUserIds, task, true);
          } catch (retryErr) {
            this.logger.error(`Re-login failed: ${retryErr.message}`);
          }
        }
        task.status = 'failed';
        task.lastAttempt = new Date().toISOString();
        task.lastError = errorMsg;
        task.retryCount = (task.retryCount || 0) + 1;
        await this.persistTask(task);
        await this.addLog({ taskId: task.id, exerciseId: exercise.objectId, exerciseName: exercise.name, date: this.formatDate(new Date(exercise.startTime)), status: 'error', message: `API error: ${task.lastError} (próba #${task.retryCount})`, timestamp: new Date().toISOString(), request: requestPayload, response: result });
      } else {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.lastAttempt = new Date().toISOString();
        task.enabled = false;
        task.retryCount = 0;
        task.lastError = undefined;
        await this.persistTask(task);
        await this.addLog({ taskId: task.id, exerciseId: exercise.objectId, exerciseName: exercise.name, date: this.formatDate(new Date(exercise.startTime)), status: 'success', message: `✅ Zarejestrowano na "${exercise.name}" (${exercise.dayOfAWeek} ${task.time}) – zadanie zakończone`, timestamp: new Date().toISOString(), request: requestPayload, response: result });
      }
    } catch (e) {
      task.status = 'failed';
      task.lastAttempt = new Date().toISOString();
      task.lastError = e.message;
      task.retryCount = (task.retryCount || 0) + 1;
      await this.persistTask(task);
      await this.addLog({ taskId: task.id, exerciseId: exercise.objectId, exerciseName: exercise.name, date: this.formatDate(new Date(exercise.startTime)), status: 'error', message: `Registration exception: ${e.message} (próba #${task.retryCount})`, timestamp: new Date().toISOString(), request: { exerciseId: exercise.objectId, webUserIds }, response: { error: e.message } });
    }
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
