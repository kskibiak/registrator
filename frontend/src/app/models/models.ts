export interface User {
  id: string;
  email: string;
  password: string;
  webUserIds: string;
  sessionToken?: string;
  tokenValidTo?: string;
}

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

export interface Exercise {
  objectId: number;
  name: string;
  capacity: number;
  reserved: number;
  startTime: number;
  closeTime: number;
  saleFrom: number;
  saleTo: number;
  dayOfAWeek: string;
  zoneName: string;
  humanName: string;
  exerciseGroupName: string;
  assigned: boolean;
  waitList: boolean;
  description: string;
  status: string;
  day: string;
}
