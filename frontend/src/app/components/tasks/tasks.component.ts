import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { TaskDefinition, TaskLog, User, Exercise } from '../../models/models';
import { interval, Subscription, forkJoin } from 'rxjs';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="panel">
      <div class="header-row">
        <h2>📋 Zadania auto-rejestracji</h2>
        <div class="header-actions">
          <div class="settings-inline">
            <label>⏱ Retry co:</label>
            <input type="number" [(ngModel)]="retryIntervalSeconds" min="5" max="3600" class="retry-input" />
            <span class="retry-unit">s</span>
            <button class="btn-sm btn-save-settings" (click)="saveSettings()" [disabled]="settingsSaving">
              {{ settingsSaving ? '...' : '💾' }}
            </button>
          </div>
          <button class="btn-primary" (click)="openDialog()">➕ Dodaj zajęcia</button>
        </div>
      </div>

      <!-- Tasks Table -->
      <table *ngIf="tasks.length > 0">
        <thead>
          <tr>
            <th>Użytkownik</th>
            <th>Zajęcia</th>
            <th>Dzień</th>
            <th>Godzina</th>
            <th>Status</th>
            <th>Następna próba</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let task of tasks"
              [class.disabled]="!task.enabled"
              [class.task-completed]="task.status === 'completed'"
              [class.task-failed]="task.status === 'failed'">
            <td>{{ getUserEmail(task.userId) }}</td>
            <td>{{ task.exerciseName }}</td>
            <td>{{ task.dayOfWeek }}</td>
            <td>{{ task.time }}</td>
            <td>
              <span *ngIf="task.status === 'completed'" class="badge-completed">✅ Zarejestrowano</span>
              <span *ngIf="task.status === 'failed'" class="badge-failed">
                ❌ Błąd (#{{ task.retryCount }})
              </span>
              <span *ngIf="task.status === 'active' && task.enabled" class="badge-on">⏳ Aktywne</span>
              <span *ngIf="task.status === 'active' && !task.enabled" class="badge-off">⏸ Wstrzymane</span>
            </td>
            <td>
              <span *ngIf="task.status === 'completed'" class="text-dim">—</span>
              <span *ngIf="task.status !== 'completed' && task.nextTrigger" class="next-trigger">
                {{ task.nextTrigger | date:'dd.MM HH:mm:ss' }}
              </span>
              <span *ngIf="task.status !== 'completed' && !task.nextTrigger" class="text-dim">
                Oczekuje...
              </span>
            </td>
            <td class="actions-cell">
              <button class="btn-sm btn-log" (click)="openLogDialog(task)" title="Logi">📜</button>
              <button class="btn-sm" (click)="toggle(task.id)" *ngIf="task.status !== 'completed'" title="Wstrzymaj/Wznów">
                {{ task.enabled ? '⏸' : '▶' }}
              </button>
              <button class="btn-sm btn-danger" (click)="remove(task.id)" title="Usuń">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>

      <p *ngIf="tasks.length === 0" class="muted">Brak zadań. Kliknij „➕ Dodaj zajęcia", aby wyszukać i dodać.</p>
    </div>

    <!-- ═══ Log Dialog (per task) ═══ -->
    <div class="overlay" *ngIf="logDialogOpen" (click)="closeLogDialog()">
      <div class="dialog log-dialog" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2>📜 Logi: {{ logDialogTask?.exerciseName }} ({{ logDialogTask?.dayOfWeek }} {{ logDialogTask?.time }})</h2>
          <button class="btn-close" (click)="closeLogDialog()">✕</button>
        </div>

        <!-- Task info bar -->
        <div class="log-task-info">
          <div class="info-item">
            <span class="info-label">Status:</span>
            <span *ngIf="logDialogTask?.status === 'completed'" class="badge-completed">✅ Zarejestrowano</span>
            <span *ngIf="logDialogTask?.status === 'failed'" class="badge-failed">❌ Błąd (próba #{{ logDialogTask?.retryCount }})</span>
            <span *ngIf="logDialogTask?.status === 'active'" class="badge-on">⏳ Aktywne</span>
          </div>
          <div class="info-item" *ngIf="logDialogTask?.lastAttempt">
            <span class="info-label">Ostatnia próba:</span>
            <span>{{ logDialogTask?.lastAttempt | date:'dd.MM.yyyy HH:mm:ss' }}</span>
          </div>
          <div class="info-item" *ngIf="logDialogTask?.nextTrigger && logDialogTask?.status !== 'completed'">
            <span class="info-label">Następna próba:</span>
            <span class="next-trigger">{{ logDialogTask?.nextTrigger | date:'dd.MM.yyyy HH:mm:ss' }}</span>
          </div>
          <div class="info-item" *ngIf="logDialogTask?.completedAt">
            <span class="info-label">Zakończono:</span>
            <span class="badge-completed">{{ logDialogTask?.completedAt | date:'dd.MM.yyyy HH:mm:ss' }}</span>
          </div>
          <div class="info-item" *ngIf="logDialogTask?.lastError">
            <span class="info-label">Ostatni błąd:</span>
            <span class="text-error">{{ logDialogTask?.lastError }}</span>
          </div>
          <div class="info-item">
            <button class="btn-sm btn-preview" (click)="loadPreview()" [disabled]="previewLoading">
              {{ previewLoading ? '⏳ Ładuję...' : '📤 Podgląd requestu' }}
            </button>
          </div>
        </div>

        <!-- Preview section -->
        <div class="preview-section" *ngIf="previewData">
          <div class="preview-header" (click)="previewExpanded = !previewExpanded">
            <h4>📤 Planowany request ({{ previewData.matchedExercises }} pasujących zajęć)</h4>
            <span class="log-card-expand">{{ previewExpanded ? '▼' : '▶' }}</span>
          </div>
          <div *ngIf="previewData.error" class="error" style="padding: 8px 20px;">{{ previewData.error }}</div>
          <div class="preview-body" *ngIf="previewExpanded && !previewData.error">
            <div class="detail-section" *ngIf="previewData.user">
              <h4>👤 Użytkownik</h4>
              <pre>{{ previewData.user | json }}</pre>
            </div>
            <div *ngFor="let req of previewData.plannedRequests; let i = index" class="detail-section">
              <h4>📤 Request #{{ i + 1 }} — {{ req.exerciseInfo?.name }} ({{ req.exerciseInfo?.day }})</h4>
              <div class="exercise-meta">
                <span>🕐 {{ req.exerciseInfo?.startTime | date:'dd.MM.yyyy HH:mm' }}</span>
                <span>📅 Rejestracja od: {{ req.exerciseInfo?.saleFrom | date:'dd.MM HH:mm' }}</span>
                <span [class]="req.exerciseInfo?.registrationOpen ? 'badge-open' : 'badge-waiting'">
                  {{ req.exerciseInfo?.registrationOpen ? '🟢 Otwarta' : '🔴 Nie otwarta' }}
                </span>
                <span>Miejsca: {{ req.exerciseInfo?.reserved }}/{{ req.exerciseInfo?.capacity }}</span>
              </div>
              <pre>{{ {url: req.url, method: req.method, headers: req.headers, body: req.body} | json }}</pre>
            </div>
            <div *ngIf="previewData.plannedRequests?.length === 0" class="muted" style="padding: 12px 0;">
              Brak pasujących zajęć w najbliższych 14 dniach.
            </div>
          </div>
        </div>

        <!-- Log entries -->
        <div class="log-entries-list">
          <div *ngIf="taskLogs.length === 0" class="muted" style="padding: 20px;">Brak logów dla tego zadania.</div>
          <div *ngFor="let log of taskLogs; let i = index" class="log-card" [class]="'log-card-' + log.status">
            <div class="log-card-header" (click)="toggleLogExpand(i)">
              <span class="log-card-time">{{ log.timestamp | date:'dd.MM.yyyy HH:mm:ss' }}</span>
              <span class="log-card-badge" [class]="'lcb-' + log.status">{{ log.status }}</span>
              <span class="log-card-msg">{{ log.message }}</span>
              <span class="log-card-expand">{{ expandedLogIdx === i ? '▼' : '▶' }}</span>
            </div>
            <div class="log-card-detail" *ngIf="expandedLogIdx === i">
              <div class="detail-section" *ngIf="log.request">
                <h4>📤 Request</h4>
                <pre>{{ log.request | json }}</pre>
              </div>
              <div class="detail-section" *ngIf="log.response">
                <h4>📥 Response</h4>
                <pre>{{ log.response | json }}</pre>
              </div>
              <div class="detail-section" *ngIf="!log.request && !log.response">
                <p class="muted">Brak danych request/response dla tego wpisu.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Search Dialog (modal overlay) ═══ -->
    <div class="overlay" *ngIf="dialogOpen" (click)="closeDialog()">
      <div class="dialog" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2>🔍 Wyszukaj zajęcia</h2>
          <button class="btn-close" (click)="closeDialog()">✕</button>
        </div>

        <div class="dialog-filters">
          <div class="filter-row">
            <select [(ngModel)]="dlgUserId" (ngModelChange)="dlgExercises = []; dlgSearched = false;">
              <option value="">-- wybierz użytkownika --</option>
              <option *ngFor="let u of users" [value]="u.id">{{ u.email }}</option>
            </select>
            <input [(ngModel)]="dlgSearchName" placeholder="Nazwa zajęć..." (keyup.enter)="searchExercises()" />
          </div>
          <div class="filter-row">
            <select [(ngModel)]="dlgSearchDay">
              <option value="">Wszystkie dni</option>
              <option *ngFor="let d of days" [value]="d">{{ d }}</option>
            </select>
            <div class="date-range">
              <label>Od:</label>
              <input type="date" [(ngModel)]="dlgDateFrom" />
              <label>Do:</label>
              <input type="date" [(ngModel)]="dlgDateTo" />
            </div>
            <button (click)="searchExercises()" [disabled]="!dlgUserId || dlgSearching">
              {{ dlgSearching ? 'Szukam...' : '🔍 Szukaj' }}
            </button>
          </div>
        </div>

        <div *ngIf="dlgError" class="error">{{ dlgError }}</div>

        <!-- Results -->
        <div class="dialog-results" *ngIf="dlgExercises.length > 0">
          <div class="results-info">
            <span>Znaleziono: {{ dlgExercises.length }} zajęć</span>
            <span>Strona {{ dlgPage }} z {{ totalPages }}</span>
          </div>
          <table class="ex-table">
            <thead>
              <tr>
                <th class="col-check"></th>
                <th>Zajęcia</th>
                <th>Dzień</th>
                <th>Godzina</th>
                <th>Trener</th>
                <th>Miejsca</th>
                <th>Rejestracja</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ex of pagedExercises"
                  [class.past]="isPast(ex)"
                  [class.assigned]="ex.assigned"
                  [class.selected]="dlgSelected.has(ex.objectId)">
                <td class="col-check">
                  <input type="checkbox"
                         [checked]="dlgSelected.has(ex.objectId)"
                         [disabled]="isPast(ex) || ex.assigned"
                         (change)="toggleSelect(ex)" />
                </td>
                <td><strong>{{ ex.name }}</strong></td>
                <td>{{ ex.dayOfAWeek }}, {{ formatDate(ex.startTime) }}</td>
                <td>{{ formatTime(ex.startTime) }} – {{ formatTime(ex.closeTime) }}</td>
                <td>{{ ex.humanName }}</td>
                <td>
                  <span [class.full]="ex.reserved >= ex.capacity">{{ ex.reserved }}/{{ ex.capacity }}</span>
                </td>
                <td>
                  <span *ngIf="ex.assigned" class="badge-assigned">✅ Zapisany</span>
                  <span *ngIf="isPast(ex) && !ex.assigned" class="badge-past">Minęło</span>
                  <span *ngIf="isRegOpen(ex) && !ex.assigned && !isPast(ex)" class="badge-open">Otwarta</span>
                  <span *ngIf="isRegNotYet(ex) && !isPast(ex)" class="badge-waiting">
                    Od {{ formatDateTime(ex.saleFrom) }}
                  </span>
                  <span *ngIf="isRegClosed(ex) && !ex.assigned && !isPast(ex)" class="badge-closed">Zamknięta</span>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div class="pagination">
            <button class="btn-sm" (click)="dlgPage = 1" [disabled]="dlgPage <= 1">«</button>
            <button class="btn-sm" (click)="dlgPage = dlgPage - 1" [disabled]="dlgPage <= 1">‹</button>
            <span class="page-info">{{ dlgPage }} / {{ totalPages }}</span>
            <button class="btn-sm" (click)="dlgPage = dlgPage + 1" [disabled]="dlgPage >= totalPages">›</button>
            <button class="btn-sm" (click)="dlgPage = totalPages" [disabled]="dlgPage >= totalPages">»</button>
            <select class="page-size-select" [(ngModel)]="dlgPageSize" (ngModelChange)="dlgPage = 1">
              <option [ngValue]="10">10 / str.</option>
              <option [ngValue]="25">25 / str.</option>
              <option [ngValue]="50">50 / str.</option>
              <option [ngValue]="100">100 / str.</option>
            </select>
          </div>
        </div>

        <p *ngIf="dlgExercises.length === 0 && dlgSearched" class="muted">Brak wyników.</p>

        <!-- Footer -->
        <div class="dialog-footer" *ngIf="dlgExercises.length > 0">
          <span class="selected-count">Zaznaczono: {{ dlgSelected.size }}</span>
          <button class="btn-primary" (click)="addSelectedTasks()" [disabled]="dlgSelected.size === 0 || dlgAdding">
            {{ dlgAdding ? 'Dodaję...' : '➕ Dodaj zaznaczone do zadań (' + dlgSelected.size + ')' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .header-row h2 { margin-bottom: 0; }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .settings-inline { display: flex; align-items: center; gap: 4px; }
    .settings-inline label { color: #888; font-size: 12px; white-space: nowrap; }
    .retry-input { width: 60px; text-align: center; padding: 4px 6px; font-size: 13px; }
    .retry-unit { color: #888; font-size: 12px; }
    .btn-save-settings { background: #2c3e50; padding: 4px 8px; font-size: 12px; }
    .btn-primary { padding: 8px 18px; background: #8e44ad; border-color: #8e44ad; border-radius: 6px; color: #fff; font-size: 14px; font-weight: 500; }
    .btn-primary:hover:not(:disabled) { background: #9b59b6; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #333; }
    tr:hover { background: #1a1a2e; }
    tr.disabled { opacity: 0.5; }
    tr.task-completed { background: rgba(39, 174, 96, 0.08); }
    tr.task-failed { background: rgba(192, 57, 43, 0.08); }
    .muted { color: #666; font-style: italic; }
    .btn-sm { padding: 4px 8px; font-size: 12px; margin-right: 4px; cursor: pointer; }
    .btn-danger { background: #c0392b; }
    .btn-log { background: #2c3e50; }
    .badge-on { color: #2ecc71; font-weight: bold; }
    .badge-off { color: #e67e22; }
    .badge-completed { color: #2ecc71; font-weight: bold; font-size: 12px; }
    .badge-failed { color: #e74c3c; font-weight: bold; font-size: 12px; }
    .next-trigger { color: #3498db; font-size: 12px; font-weight: bold; }
    .text-dim { color: #555; font-size: 12px; }
    .text-error { color: #e74c3c; font-size: 12px; }
    .actions-cell { white-space: nowrap; }

    /* ── Overlay / Dialog shared ── */
    .overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .dialog {
      background: #111; border: 1px solid #333; border-radius: 12px;
      width: 90vw; max-width: 1100px; max-height: 85vh;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .dialog-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; border-bottom: 1px solid #333;
    }
    .dialog-header h2 { margin: 0; font-size: 18px; }
    .btn-close { background: none; border: none; color: #888; font-size: 20px; cursor: pointer; padding: 4px 8px; }
    .btn-close:hover { color: #fff; }

    /* ── Log dialog ── */
    .log-dialog { max-width: 900px; }
    .log-task-info {
      display: flex; flex-wrap: wrap; gap: 16px; padding: 12px 20px;
      border-bottom: 1px solid #222; font-size: 13px;
    }
    .info-item { display: flex; gap: 6px; align-items: center; }
    .info-label { color: #888; font-weight: 500; }
    .log-entries-list { flex: 1; overflow-y: auto; padding: 8px 0; }
    .log-card { border-bottom: 1px solid #222; }
    .log-card-header {
      display: flex; gap: 8px; align-items: center; padding: 8px 20px;
      cursor: pointer; font-size: 13px;
    }
    .log-card-header:hover { background: #1a1a2e; }
    .log-card-time { color: #888; min-width: 140px; flex-shrink: 0; }
    .log-card-badge {
      padding: 2px 6px; border-radius: 4px; font-size: 11px;
      font-weight: bold; text-transform: uppercase; flex-shrink: 0;
    }
    .lcb-success { background: #27ae60; color: #fff; }
    .lcb-error { background: #c0392b; color: #fff; }
    .lcb-full { background: #e67e22; color: #fff; }
    .lcb-not_open { background: #2980b9; color: #fff; }
    .lcb-already_assigned { background: #8e44ad; color: #fff; }
    .log-card-msg { flex: 1; color: #ccc; }
    .log-card-expand { color: #888; font-size: 10px; flex-shrink: 0; }
    .log-card-detail {
      padding: 8px 20px 16px 20px; background: #0a0a1a;
      border-top: 1px solid #222;
    }
    .detail-section { margin-bottom: 12px; }
    .detail-section:last-child { margin-bottom: 0; }
    .detail-section h4 { margin: 0 0 6px 0; font-size: 13px; color: #aaa; }
    .detail-section pre {
      background: #0d0d1a; border: 1px solid #333; border-radius: 6px;
      padding: 10px; font-size: 12px; color: #8be9fd; overflow-x: auto;
      max-height: 250px; margin: 0; white-space: pre-wrap; word-break: break-all;
    }

    /* ── Search Dialog ── */
    .dialog-filters {
      padding: 12px 20px; border-bottom: 1px solid #222;
    }
    .filter-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
    .filter-row:last-child { margin-bottom: 0; }
    .filter-row input, .filter-row select { flex: 1; min-width: 120px; }
    .date-range { display: flex; gap: 6px; align-items: center; flex: 2; min-width: 260px; }
    .date-range label { color: #888; font-size: 12px; white-space: nowrap; }
    .date-range input[type="date"] { flex: 1; min-width: 120px; }
    .dialog-results { flex: 1; overflow-y: auto; padding: 0; }
    .ex-table { font-size: 13px; }
    .ex-table th { position: sticky; top: 0; background: #111; z-index: 1; }
    .col-check { width: 36px; text-align: center; }
    .col-check input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #8e44ad; }
    tr.past { opacity: 0.35; }
    tr.assigned { opacity: 0.5; }
    tr.selected { background: #2a1a3e; }
    .full { color: #e74c3c; font-weight: bold; }
    .badge-assigned { color: #2ecc71; font-size: 12px; }
    .badge-past { color: #555; font-size: 12px; }
    .badge-open { color: #f39c12; font-size: 12px; font-weight: bold; }
    .badge-waiting { color: #3498db; font-size: 12px; }
    .badge-closed { color: #888; font-size: 12px; }
    .error { color: #ff6b6b; padding: 8px 20px; }
    .results-info { display: flex; justify-content: space-between; padding: 8px 20px; color: #888; font-size: 12px; border-bottom: 1px solid #222; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-top: 1px solid #222; }
    .page-info { color: #aaa; font-size: 13px; min-width: 60px; text-align: center; }
    .page-size-select { width: 90px; flex: none; }
    .dialog-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 20px; border-top: 1px solid #333;
    }
    .selected-count { color: #aaa; font-size: 13px; }

    /* ── Preview section ── */
    .btn-preview { background: #2c3e50; padding: 4px 12px; font-size: 12px; border-radius: 4px; }
    .btn-preview:hover:not(:disabled) { background: #34495e; }
    .preview-section { border-bottom: 1px solid #222; }
    .preview-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 20px; cursor: pointer; background: #0d0d1a;
    }
    .preview-header:hover { background: #1a1a2e; }
    .preview-header h4 { margin: 0; font-size: 14px; color: #8be9fd; }
    .preview-body { padding: 8px 20px 16px 20px; background: #0a0a1a; }
    .exercise-meta {
      display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px;
      font-size: 12px; color: #aaa;
    }
  `]
})
export class TasksComponent implements OnInit, OnDestroy {
  users: User[] = [];
  tasks: TaskDefinition[] = [];
  logs: TaskLog[] = [];

  // Search dialog state
  dialogOpen = false;
  dlgUserId = '';
  dlgSearchName = '';
  dlgSearchDay = '';
  dlgDateFrom = '';
  dlgDateTo = '';
  dlgSearching = false;
  dlgSearched = false;
  dlgError = '';
  dlgExercises: Exercise[] = [];
  dlgSelected = new Set<number>();
  dlgAdding = false;
  dlgPage = 1;
  dlgPageSize = 25;

  // Log dialog state
  logDialogOpen = false;
  logDialogTask: TaskDefinition | null = null;
  taskLogs: TaskLog[] = [];
  expandedLogIdx: number | null = null;

  // Preview state
  previewData: any = null;
  previewLoading = false;
  previewExpanded = true;

  // Settings
  retryIntervalSeconds = 30;
  settingsSaving = false;

  days = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

  private pollSub?: Subscription;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadAll();
    this.loadSettings();
    this.pollSub = interval(10_000).subscribe(() => this.loadTasks());
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  loadAll() {
    this.api.getUsers().subscribe((u) => this.users = u);
    this.loadTasks();
  }

  loadTasks() {
    this.api.getTasks().subscribe((t) => this.tasks = t);
  }

  getUserEmail(userId: string): string {
    return this.users.find((u) => u.id === userId)?.email || userId;
  }

  toggle(taskId: string) {
    this.api.toggleTask(taskId).subscribe(() => this.loadAll());
  }

  remove(taskId: string) {
    if (!confirm('Na pewno usunąć to zadanie?')) return;
    this.api.removeTask(taskId).subscribe(() => this.loadAll());
  }

  // ── Log Dialog ───────────────────────────────────────────

  openLogDialog(task: TaskDefinition) {
    this.logDialogOpen = true;
    this.logDialogTask = task;
    this.expandedLogIdx = null;
    this.previewData = null;
    this.previewLoading = false;
    this.previewExpanded = true;
    this.api.getLogs(task.id, 200).subscribe((l) => this.taskLogs = l.reverse());
  }

  closeLogDialog() {
    this.logDialogOpen = false;
    this.logDialogTask = null;
    this.taskLogs = [];
    this.expandedLogIdx = null;
    this.previewData = null;
  }

  toggleLogExpand(idx: number) {
    this.expandedLogIdx = this.expandedLogIdx === idx ? null : idx;
  }

  loadPreview() {
    if (!this.logDialogTask) return;
    this.previewLoading = true;
    this.previewData = null;
    this.api.getTaskPreview(this.logDialogTask.id).subscribe({
      next: (data) => {
        this.previewData = data;
        this.previewLoading = false;
        this.previewExpanded = true;
      },
      error: (e) => {
        this.previewData = { error: e.error?.message || 'Błąd ładowania podglądu', plannedRequests: [] };
        this.previewLoading = false;
      },
    });
  }

  // ── Search Dialog ────────────────────────────────────────

  openDialog() {
    this.dialogOpen = true;
    this.dlgExercises = [];
    this.dlgSelected.clear();
    this.dlgSearched = false;
    this.dlgError = '';
    this.dlgPage = 1;
    // Default date range: today + 7 days
    const now = new Date();
    this.dlgDateFrom = this.toISODate(now);
    this.dlgDateTo = this.toISODate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    // Pre-select first user if only one
    if (this.users.length === 1) {
      this.dlgUserId = this.users[0].id;
    }
    // Auto-search with defaults if user is selected
    if (this.dlgUserId) {
      this.searchExercises();
    }
  }

  closeDialog() {
    this.dialogOpen = false;
  }

  searchExercises() {
    this.dlgSearching = true;
    this.dlgError = '';
    this.dlgSelected.clear();
    this.dlgPage = 1;
    this.api.searchExercises(
      this.dlgUserId,
      this.dlgSearchName,
      this.dlgSearchDay || undefined,
      this.dlgDateFrom || undefined,
      this.dlgDateTo || undefined,
    ).subscribe({
      next: (ex) => {
        this.dlgExercises = ex;
        this.dlgSearching = false;
        this.dlgSearched = true;
      },
      error: (e) => {
        this.dlgError = e.error?.message || 'Błąd wyszukiwania';
        this.dlgSearching = false;
      },
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.dlgExercises.length / this.dlgPageSize));
  }

  get pagedExercises(): Exercise[] {
    const start = (this.dlgPage - 1) * this.dlgPageSize;
    return this.dlgExercises.slice(start, start + this.dlgPageSize);
  }

  toggleSelect(ex: Exercise) {
    if (this.dlgSelected.has(ex.objectId)) {
      this.dlgSelected.delete(ex.objectId);
    } else {
      this.dlgSelected.add(ex.objectId);
    }
  }

  addSelectedTasks() {
    const selected = this.dlgExercises.filter((ex) => this.dlgSelected.has(ex.objectId));
    if (selected.length === 0) return;

    this.dlgAdding = true;
    this.dlgError = '';

    const calls = selected.map((ex) => {
      const d = new Date(ex.startTime);
      const time = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      return this.api.addTask(this.dlgUserId, ex.name, ex.dayOfAWeek, time);
    });

    forkJoin(calls).subscribe({
      next: () => {
        this.dlgAdding = false;
        this.dialogOpen = false;
        this.loadAll();
      },
      error: (e) => {
        this.dlgError = e.error?.message || 'Błąd dodawania zadań';
        this.dlgAdding = false;
      },
    });
  }

  isPast(ex: Exercise): boolean {
    return ex.startTime < Date.now();
  }

  isRegOpen(ex: Exercise): boolean {
    const now = Date.now();
    return now >= ex.saleFrom && now <= ex.saleTo;
  }

  isRegNotYet(ex: Exercise): boolean {
    return Date.now() < ex.saleFrom;
  }

  isRegClosed(ex: Exercise): boolean {
    return Date.now() > ex.saleTo;
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }

  formatDateTime(ts: number): string {
    return new Date(ts).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private toISODate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  loadSettings() {
    this.api.getSettings().subscribe(s => {
      this.retryIntervalSeconds = s.retryIntervalSeconds;
    });
  }

  saveSettings() {
    this.settingsSaving = true;
    this.api.updateSettings({ retryIntervalSeconds: this.retryIntervalSeconds }).subscribe({
      next: () => this.settingsSaving = false,
      error: () => this.settingsSaving = false
    });
  }
}
