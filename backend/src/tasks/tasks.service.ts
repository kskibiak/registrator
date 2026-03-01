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
  registrationOpensAt?: string;
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
      registrationOpensAt: e.registrationOpensAt ?? undefined,
    };
  }

  private async persistTask(task: TaskDefinition): Promise<void> {
    await this.taskRepo.save({
      ...task,
      nextTrigger: task.nextTrigger ?? null,
      lastAttempt: task.lastAttempt ?? null,
      lastError: task.lastError ?? null,
      completedAt: task.completedAt ?? null,
      registrationOpensAt: task.registrationOpensAt ?? null,
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
        registrationOpensAt: t.registrationOpensAt ?? null,
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
      nextTrigger: new Date().toISOString(), // trigger immediately so first check runs within 1s
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
      // If nextTrigger already set and still in the future — keep it (don't reset the wait)
      // Otherwise (past or null) — trigger immediately
      const triggerMs = task.nextTrigger ? new Date(task.nextTrigger).getTime() : 0;
      if (triggerMs <= Date.now()) {
        task.nextTrigger = new Date().toISOString();
      }
      if (task.status === 'completed') {
        // Reactivating a completed task — fresh start
        task.status = 'active';
        task.retryCount = 0;
        task.lastError = undefined;
        task.completedAt = undefined;
      } else if (task.status === 'failed') {
        // Resuming a failed task — keep retryCount so numbering is continuous
        task.status = 'active';
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
      let firstMatchedSaleFrom: number | null = null; // saleFrom of first matching exercise (for display)
      let hadAttempt = false;

      for (const [, exercises] of Object.entries(allExercises)) {
        for (const ex of exercises) {
          if (!this.matchesTask(ex, task)) continue;

          // Always record saleFrom of any matching exercise for display purposes
          if (firstMatchedSaleFrom === null) firstMatchedSaleFrom = ex.saleFrom;

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
            // Schedule a precise attempt if we're within 11 minutes (catches the 10-min early wakeup)
            if (opensIn <= 660_000 && opensIn > 0) {
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
        // Always persist saleFrom for display if we found a matching exercise
        if (firstMatchedSaleFrom !== null) {
          task.registrationOpensAt = new Date(firstMatchedSaleFrom).toISOString();
        }

        if (!hadAttempt && earliestSaleFrom !== null && currentTime < earliestSaleFrom) {
          // Exercise found — waiting for registration window to open
          // Wake up 10 minutes early to schedule a precise setTimeout near open time
          const TEN_MIN_MS = 10 * 60 * 1000;
          task.nextTrigger = new Date(Math.max(Date.now() + 5000, earliestSaleFrom - TEN_MIN_MS)).toISOString();
          this.logger.log(`Task "${task.exerciseName}": registration opens at ${task.registrationOpensAt}, waking up at ${task.nextTrigger}`);
        } else if (!hadAttempt && earliestSaleFrom === null) {
          // Exercise not yet visible in API — schedule smartly based on class occurrence
          const nextOccurrence = this.computeNextOccurrence(task);
          if (nextOccurrence) {
            const msUntil = nextOccurrence.getTime() - currentTime;
            const API_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
            if (msUntil > API_WINDOW_MS) {
              // Class >14 days away — wake up when it enters the API window
              task.nextTrigger = new Date(nextOccurrence.getTime() - API_WINDOW_MS).toISOString();
              this.logger.log(`Task "${task.exerciseName}": class >14d away, will recheck at ${task.nextTrigger}`);
            } else {
              // Within window but no match — retry in 1h (class name/time mismatch or API lag)
              task.nextTrigger = new Date(currentTime + Math.max(retryMs, 60 * 60 * 1000)).toISOString();
              this.logger.warn(`Task "${task.exerciseName}": within API window but no match found — retrying in 1h`);
            }
          } else {
            task.nextTrigger = new Date(currentTime + retryMs).toISOString();
          }
        } else {
          // Attempt was made (success or fail) — standard retry
          task.nextTrigger = new Date(currentTime + retryMs).toISOString();
        }
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

  /** Maps common Polish and English day-of-week names to JS getDay() index (0=Sun … 6=Sat) */
  private parseDayOfWeek(dayStr: string): number | null {
    const lower = dayStr.toLowerCase().trim();
    const map: Record<string, number> = {
      'niedziela': 0, 'nd': 0, 'sunday': 0, 'sun': 0,
      'poniedziałek': 1, 'poniedzialek': 1, 'pon': 1, 'monday': 1, 'mon': 1,
      'wtorek': 2, 'wt': 2, 'tuesday': 2, 'tue': 2,
      'środa': 3, 'sroda': 3, 'sr': 3, 'wednesday': 3, 'wed': 3,
      'czwartek': 4, 'cz': 4, 'thursday': 4, 'thu': 4,
      'piątek': 5, 'piatek': 5, 'pt': 5, 'friday': 5, 'fri': 5,
      'sobota': 6, 'sob': 6, 'saturday': 6, 'sat': 6,
    };
    // full word match first, then prefix match
    for (const [key, val] of Object.entries(map)) {
      if (lower === key || lower.startsWith(key)) return val;
    }
    return null;
  }

  /** Returns the next Date on which a task's class falls (based on dayOfWeek + time) */
  private computeNextOccurrence(task: TaskDefinition): Date | null {
    const dayIndex = this.parseDayOfWeek(task.dayOfWeek);
    if (dayIndex === null) return null;
    const [hStr, mStr] = task.time.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    if (isNaN(hours) || isNaN(minutes)) return null;

    const now = new Date();
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);

    const todayIndex = now.getDay();
    let daysUntil = (dayIndex - todayIndex + 7) % 7;
    // If today is that day but the time has already passed, go to next week
    if (daysUntil === 0 && candidate.getTime() <= now.getTime()) daysUntil = 7;
    candidate.setDate(candidate.getDate() + daysUntil);
    return candidate;
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
