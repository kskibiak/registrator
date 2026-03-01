import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="logo">FitPark<br/><small>Registrator</small></div>
        <a routerLink="/tasks" routerLinkActive="active">📋 Zadania</a>
        <a routerLink="/users" routerLinkActive="active">👤 Użytkownicy</a>
      </nav>
      <main class="content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .app-shell { display: flex; height: 100vh; }
    .sidebar {
      width: 200px;
      background: #0f0f23;
      border-right: 1px solid #333;
      display: flex;
      flex-direction: column;
      padding: 16px 0;
    }
    .logo {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      color: #e0e0e0;
      margin-bottom: 24px;
      padding: 0 16px;
    }
    .logo small { font-size: 12px; color: #888; font-weight: normal; }
    .sidebar a {
      padding: 12px 20px;
      color: #aaa;
      text-decoration: none;
      font-size: 14px;
      transition: all 0.2s;
    }
    .sidebar a:hover { background: #1a1a2e; color: #fff; }
    .sidebar a.active { background: #16213e; color: #fff; border-left: 3px solid #3498db; }
    .content { flex: 1; padding: 24px; overflow-y: auto; }
  `]
})
export class AppComponent {}
