import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User, TaskDefinition, TaskLog, Exercise } from '../models/models';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // ── Users ────────────────────────────────────────────────

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${API}/users`);
  }

  addUser(email: string, password: string): Observable<User> {
    return this.http.post<User>(`${API}/users`, { email, password });
  }

  updateUser(id: string, updates: { password?: string }): Observable<User> {
    return this.http.patch<User>(`${API}/users/${id}`, updates);
  }

  resetPassword(id: string, newPassword: string): Observable<User> {
    return this.http.patch<User>(`${API}/users/${id}/reset-password`, { password: newPassword });
  }

  removeUser(id: string): Observable<any> {
    return this.http.delete(`${API}/users/${id}`);
  }

  refreshToken(userId: string): Observable<any> {
    return this.http.post(`${API}/users/${userId}/refresh-token`, {});
  }

  // ── Tasks ────────────────────────────────────────────────

  getTasks(): Observable<TaskDefinition[]> {
    return this.http.get<TaskDefinition[]>(`${API}/tasks`);
  }

  getTasksByUser(userId: string): Observable<TaskDefinition[]> {
    return this.http.get<TaskDefinition[]>(`${API}/tasks/user/${userId}`);
  }

  addTask(userId: string, exerciseName: string, dayOfWeek: string, time: string): Observable<TaskDefinition> {
    return this.http.post<TaskDefinition>(`${API}/tasks`, { userId, exerciseName, dayOfWeek, time });
  }

  removeTask(taskId: string): Observable<any> {
    return this.http.delete(`${API}/tasks/${taskId}`);
  }

  toggleTask(taskId: string): Observable<TaskDefinition> {
    return this.http.patch<TaskDefinition>(`${API}/tasks/${taskId}/toggle`, {});
  }

  // ── Logs ─────────────────────────────────────────────────

  getLogs(taskId?: string, limit = 50): Observable<TaskLog[]> {
    let url = `${API}/tasks/logs?limit=${limit}`;
    if (taskId) url += `&taskId=${taskId}`;
    return this.http.get<TaskLog[]>(url);
  }

  getLogsByUser(userId: string): Observable<TaskLog[]> {
    return this.http.get<TaskLog[]>(`${API}/tasks/logs/user/${userId}`);
  }

  getTaskPreview(taskId: string): Observable<any> {
    return this.http.get<any>(`${API}/tasks/${taskId}/preview`);
  }

  // ── Exercises ────────────────────────────────────────────

  getExercises(userId: string, dateFrom: string, dateTo: string): Observable<Exercise[]> {
    return this.http.get<Exercise[]>(`${API}/exercises/${userId}?dateFrom=${dateFrom}&dateTo=${dateTo}`);
  }

  searchExercises(userId: string, name: string, dayOfWeek?: string, dateFrom?: string, dateTo?: string): Observable<Exercise[]> {
    let url = `${API}/exercises/${userId}/search?name=${encodeURIComponent(name)}`;
    if (dayOfWeek) url += `&dayOfWeek=${encodeURIComponent(dayOfWeek)}`;
    if (dateFrom) url += `&dateFrom=${dateFrom}`;
    if (dateTo) url += `&dateTo=${dateTo}`;
    return this.http.get<Exercise[]>(url);
  }

  // ── Settings ─────────────────────────────────────────────

  getSettings(): Observable<any> {
    return this.http.get<any>(`${API}/settings`);
  }

  updateSettings(settings: any): Observable<any> {
    return this.http.patch<any>(`${API}/settings`, settings);
  }
}
