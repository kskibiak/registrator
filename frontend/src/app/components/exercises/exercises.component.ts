import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Exercise, User } from '../../models/models';

@Component({
  selector: 'app-exercises',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="panel">
      <h2>🏋️ Przeglądarka zajęć — szukaj i dodawaj do zadań</h2>

      <div class="form-row">
        <select [(ngModel)]="selectedUserId" (ngModelChange)="onUserChange()">
          <option value="">-- wybierz użytkownika --</option>
          <option *ngFor="let u of users" [value]="u.id">{{ u.email }}</option>
        </select>
        <input [(ngModel)]="searchName" placeholder="Szukaj po nazwie (np. Fitness Mix)..." (keyup.enter)="search()" />
        <select [(ngModel)]="searchDay">
          <option value="">Wszystkie dni</option>
          <option *ngFor="let d of days" [value]="d">{{ d }}</option>
        </select>
        <button (click)="search()" [disabled]="!selectedUserId || searching">
          {{ searching ? 'Szukam...' : '🔍 Szukaj' }}
        </button>
      </div>

      <div *ngIf="successMsg" class="success">{{ successMsg }}</div>
      <div *ngIf="error" class="error">{{ error }}</div>

      <p *ngIf="!searched && selectedUserId" class="muted">
        Wyszukaj zajęcia, aby zobaczyć pełną listę. Możesz filtrować po nazwie i dniu tygodnia.
        Zajęcia, dla których rejestracja jeszcze się nie rozpoczęła, też zostaną wyświetlone — dzięki temu możesz je dodać do zadań i system automatycznie zarejestruje Cię, gdy rejestracja się otworzy.
      </p>

      <div class="exercises-grid" *ngIf="exercises.length > 0">
        <div *ngFor="let ex of exercises" class="exercise-card"
             [class.assigned]="ex.assigned"
             [class.not-open]="!isRegOpen(ex) && !ex.assigned">
          <div class="ex-header">
            <strong>{{ ex.name }}</strong>
            <span class="ex-day">{{ ex.dayOfAWeek }}, {{ formatDate(ex.startTime) }}</span>
          </div>
          <div class="ex-details">
            <span>⏰ {{ formatTime(ex.startTime) }} – {{ formatTime(ex.closeTime) }}</span>
            <span>📍 {{ ex.zoneName }}</span>
            <span>👤 {{ ex.humanName }}</span>
          </div>
          <div class="ex-capacity">
            <div class="capacity-bar">
              <div class="capacity-fill" [style.width.%]="(ex.reserved / ex.capacity) * 100"
                   [class.full]="ex.reserved >= ex.capacity"></div>
            </div>
            <span>{{ ex.reserved }}/{{ ex.capacity }}</span>
          </div>
          <div class="ex-footer">
            <div class="ex-reg">
              <span *ngIf="ex.assigned" class="badge-assigned">✅ Zapisany</span>
              <span *ngIf="isRegOpen(ex) && !ex.assigned" class="badge-open">🟢 Rejestracja otwarta</span>
              <span *ngIf="isRegNotYet(ex)" class="badge-waiting">
                🕐 Rejestracja od: {{ formatDateTime(ex.saleFrom) }}
              </span>
              <span *ngIf="isRegClosed(ex) && !ex.assigned" class="badge-closed">🔴 Rejestracja zamknięta</span>
            </div>
            <button *ngIf="!ex.assigned"
                    class="btn-add-task"
                    (click)="addToTasks(ex)"
                    [disabled]="addingTaskFor === ex.objectId">
              {{ addingTaskFor === ex.objectId ? 'Dodaję...' : '➕ Dodaj do zadań' }}
            </button>
          </div>
        </div>
      </div>

      <p *ngIf="exercises.length === 0 && searched" class="muted">Brak wyników.</p>
    </div>
  `,
  styles: [`
    .form-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .form-row input, .form-row select { flex: 1; min-width: 130px; }
    .error { color: #ff6b6b; margin-bottom: 8px; padding: 8px; background: #2a1a1a; border-radius: 6px; }
    .success { color: #2ecc71; margin-bottom: 8px; padding: 8px; background: #1a2a1a; border-radius: 6px; }
    .muted { color: #888; font-style: italic; line-height: 1.6; }
    .exercises-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
    .exercise-card {
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 14px;
      transition: border-color 0.2s;
    }
    .exercise-card:hover { border-color: #555; }
    .exercise-card.assigned { border-color: #27ae60; background: #1a2e1a; }
    .exercise-card.not-open { border-color: #444; }
    .ex-header { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: flex-start; }
    .ex-header strong { color: #e0e0e0; font-size: 15px; }
    .ex-day { color: #888; font-size: 12px; white-space: nowrap; margin-left: 8px; }
    .ex-details { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #aaa; margin-bottom: 8px; }
    .ex-capacity { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 10px; }
    .capacity-bar { flex: 1; height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
    .capacity-fill { height: 100%; background: #2ecc71; transition: width 0.3s; }
    .capacity-fill.full { background: #e74c3c; }
    .ex-footer { display: flex; justify-content: space-between; align-items: center; }
    .ex-reg { font-size: 12px; }
    .badge-assigned { color: #2ecc71; font-weight: bold; }
    .badge-open { color: #f39c12; font-weight: bold; }
    .badge-waiting { color: #3498db; }
    .badge-closed { color: #888; }
    .btn-add-task {
      padding: 6px 14px;
      font-size: 13px;
      background: #8e44ad;
      border-color: #8e44ad;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s;
    }
    .btn-add-task:hover:not(:disabled) { background: #9b59b6; }
    .btn-add-task:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class ExercisesComponent implements OnInit {
  users: User[] = [];
  exercises: Exercise[] = [];
  selectedUserId = '';
  searchName = '';
  searchDay = '';
  searching = false;
  searched = false;
  error = '';
  successMsg = '';
  addingTaskFor: number | null = null;

  days = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getUsers().subscribe((u) => this.users = u);
  }

  onUserChange() {
    this.exercises = [];
    this.searched = false;
  }

  search() {
    this.searching = true;
    this.error = '';
    this.successMsg = '';
    this.api.searchExercises(this.selectedUserId, this.searchName, this.searchDay || undefined).subscribe({
      next: (ex) => {
        this.exercises = ex;
        this.searching = false;
        this.searched = true;
      },
      error: (e) => {
        this.error = e.error?.message || 'Błąd wyszukiwania';
        this.searching = false;
      },
    });
  }

  addToTasks(ex: Exercise) {
    this.addingTaskFor = ex.objectId;
    this.error = '';
    this.successMsg = '';

    // Extract time from startTime
    const d = new Date(ex.startTime);
    const time = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');

    this.api.addTask(this.selectedUserId, ex.name, ex.dayOfAWeek, time).subscribe({
      next: () => {
        this.successMsg = `Dodano zadanie: "${ex.name}" (${ex.dayOfAWeek} ${time}). System automatycznie zarejestruje Cię, gdy rejestracja się otworzy.`;
        this.addingTaskFor = null;
      },
      error: (e) => {
        this.error = e.error?.message || 'Nie udało się dodać zadania';
        this.addingTaskFor = null;
      },
    });
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
    const d = new Date(ts);
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }

  formatDateTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
