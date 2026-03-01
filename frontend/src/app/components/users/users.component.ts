import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { User } from '../../models/models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="panel">
      <h2>👤 Użytkownicy</h2>

      <div class="form-row">
        <input [(ngModel)]="newEmail" placeholder="Email" type="email" />
        <input [(ngModel)]="newPassword" placeholder="Hasło" type="text" />
        <button (click)="addUser()" [disabled]="adding">
          {{ adding ? 'Logowanie...' : 'Dodaj' }}
        </button>
      </div>

      <div *ngIf="error" class="error">{{ error }}</div>
      <div *ngIf="successMsg" class="success">{{ successMsg }}</div>

      <table *ngIf="users.length > 0">
        <thead>
          <tr>
            <th>Email</th>
            <th>webUserIds</th>
            <th>Token ważny do</th>
            <th>Auto-odświeżenie</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let user of users">
            <td>{{ user.email }}</td>
            <td>
              <span class="webuser-val">{{ user.webUserIds }}</span>
            </td>
            <td>{{ user.tokenValidTo ? (user.tokenValidTo | date:'short') : '—' }}</td>
            <td>
              <span *ngIf="user.tokenValidTo" [class]="getAutoRefreshClass(user)">
                {{ getAutoRefreshLabel(user) }}
              </span>
              <span *ngIf="!user.tokenValidTo" class="muted">—</span>
            </td>
            <td class="actions-cell">
              <button class="btn-sm btn-edit" (click)="openEditDialog(user)" title="Zmień hasło">🔑</button>
              <button class="btn-sm" (click)="refresh(user.id)" title="Odśwież token">🔄</button>
              <button class="btn-sm btn-danger" (click)="remove(user.id)" title="Usuń">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>

      <p *ngIf="users.length === 0" class="muted">Brak użytkowników. Dodaj pierwszego powyżej.</p>
    </div>

    <!-- Reset password dialog -->
    <div class="overlay" *ngIf="editDialogOpen" (click)="closeEditDialog()">
      <div class="edit-dialog" (click)="$event.stopPropagation()">
        <div class="edit-header">
          <h3>🔑 Zmień hasło: {{ editUser?.email }}</h3>
          <button class="btn-close" (click)="closeEditDialog()">✕</button>
        </div>
        <div class="edit-body">
          <label>Nowe hasło</label>
          <input [(ngModel)]="editPassword" type="password" placeholder="Nowe hasło..." />
          <p class="hint">Hasło zostanie użyte przy następnej próbie pobrania tokenu. Nie jest wyświetlane na liście.</p>
          <div *ngIf="editError" class="error" style="margin-top: 8px;">{{ editError }}</div>
        </div>
        <div class="edit-footer">
          <button class="btn-secondary" (click)="closeEditDialog()">Anuluj</button>
          <button class="btn-primary" (click)="saveEdit()" [disabled]="editSaving || !editPassword">
            {{ editSaving ? 'Zapisuję...' : '💾 Zapisz' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .form-row { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .form-row input { flex: 1; min-width: 150px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #333; }
    tr:hover { background: #1a1a2e; }
    .error { color: #ff6b6b; margin-bottom: 8px; }
    .success { color: #2ecc71; margin-bottom: 8px; }
    .muted { color: #666; font-style: italic; }
    .btn-sm { padding: 4px 8px; font-size: 12px; margin-right: 4px; cursor: pointer; }
    .btn-danger { background: #c0392b; }
    .btn-danger:hover { background: #e74c3c; }
    .btn-edit { background: #2c3e50; }
    .webuser-val { font-family: monospace; color: #8be9fd; font-size: 13px; }
    .actions-cell { white-space: nowrap; }

    .overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .edit-dialog {
      background: #111; border: 1px solid #333; border-radius: 12px;
      width: 420px; max-width: 90vw;
    }
    .edit-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 20px; border-bottom: 1px solid #333;
    }
    .edit-header h3 { margin: 0; font-size: 16px; }
    .btn-close { background: none; border: none; color: #888; font-size: 20px; cursor: pointer; }
    .btn-close:hover { color: #fff; }
    .edit-body { padding: 16px 20px; }
    .edit-body label { display: block; color: #888; font-size: 12px; margin-bottom: 4px; margin-top: 12px; }
    .edit-body label:first-child { margin-top: 0; }
    .edit-body input { width: 100%; box-sizing: border-box; }
    .edit-footer {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px; border-top: 1px solid #333;
    }
    .btn-primary { padding: 8px 18px; background: #8e44ad; border-color: #8e44ad; border-radius: 6px; color: #fff; font-size: 14px; }
    .btn-primary:hover:not(:disabled) { background: #9b59b6; }
    .btn-secondary { padding: 8px 18px; background: #333; border-radius: 6px; color: #ccc; font-size: 14px; border: 1px solid #555; }
    .btn-secondary:hover { background: #444; }
    .hint { color: #666; font-size: 11px; margin-top: 8px; font-style: italic; }
    .auto-refresh-ok { color: #2ecc71; font-size: 12px; }
    .auto-refresh-soon { color: #f39c12; font-size: 12px; font-weight: bold; }
    .auto-refresh-expired { color: #e74c3c; font-size: 12px; font-weight: bold; }
  `]
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  newEmail = '';
  newPassword = '';
  adding = false;
  error = '';
  successMsg = '';

  // Edit dialog
  editDialogOpen = false;
  editUser: User | null = null;
  editPassword = '';
  editSaving = false;
  editError = '';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadUsers();
    // Auto-refresh the display every 30s so auto-refresh countdown stays current
    setInterval(() => this.loadUsers(), 30000);
  }

  loadUsers() {
    this.api.getUsers().subscribe({
      next: (u) => this.users = u,
      error: (e) => this.error = e.error?.message || 'Błąd pobierania użytkowników',
    });
  }

  addUser() {
    this.adding = true;
    this.error = '';
    this.successMsg = '';
    this.api.addUser(this.newEmail, this.newPassword).subscribe({
      next: () => {
        this.newEmail = '';
        this.newPassword = '';
        this.adding = false;
        this.loadUsers();
      },
      error: (e) => {
        this.error = e.error?.message || 'Błąd logowania — sprawdź dane.';
        this.adding = false;
      },
    });
  }

  remove(id: string) {
    if (!confirm('Na pewno usunąć tego użytkownika?')) return;
    this.api.removeUser(id).subscribe(() => this.loadUsers());
  }

  refresh(id: string) {
    this.api.refreshToken(id).subscribe({
      next: () => this.loadUsers(),
      error: (e) => this.error = e.error?.message || 'Błąd odświeżania tokenu',
    });
  }

  openEditDialog(user: User) {
    this.editDialogOpen = true;
    this.editUser = user;
    this.editPassword = '';
    this.editError = '';
  }

  closeEditDialog() {
    this.editDialogOpen = false;
    this.editUser = null;
  }

  saveEdit() {
    if (!this.editUser || !this.editPassword) return;
    this.editSaving = true;
    this.editError = '';

    this.api.resetPassword(this.editUser.id, this.editPassword).subscribe({
      next: () => {
        this.editSaving = false;
        this.closeEditDialog();
        this.successMsg = 'Hasło zaktualizowane.';
        this.loadUsers();
        setTimeout(() => this.successMsg = '', 3000);
      },
      error: (e) => {
        this.editError = e.error?.message || 'Błąd zapisywania hasła.';
        this.editSaving = false;
      },
    });
  }

  // ── Auto-refresh helpers ─────────────────────────────────

  getAutoRefreshLabel(user: User): string {
    if (!user.tokenValidTo) return '—';
    const validTo = new Date(user.tokenValidTo).getTime();
    const now = Date.now();
    const remainingMs = validTo - now;

    if (remainingMs <= 0) return 'Token wygasł';

    // Auto-refresh fires when <10min remain
    const refreshThresholdMs = 10 * 60 * 1000;
    const timeUntilRefreshMs = remainingMs - refreshThresholdMs;

    if (timeUntilRefreshMs <= 0) {
      return 'Odświeżanie wkrótce...';
    }

    const mins = Math.floor(timeUntilRefreshMs / 60000);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;

    if (hours > 0) {
      return `za ${hours}h ${remMins}min`;
    }
    return `za ${mins}min`;
  }

  getAutoRefreshClass(user: User): string {
    if (!user.tokenValidTo) return '';
    const validTo = new Date(user.tokenValidTo).getTime();
    const now = Date.now();
    const remainingMs = validTo - now;

    if (remainingMs <= 0) return 'auto-refresh-expired';

    const refreshThresholdMs = 10 * 60 * 1000;
    const timeUntilRefreshMs = remainingMs - refreshThresholdMs;

    if (timeUntilRefreshMs <= 5 * 60 * 1000) return 'auto-refresh-soon';
    return 'auto-refresh-ok';
  }
}
