export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum Status {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ReminderType {
  TASK = 'TASK',
  APPOINTMENT = 'APPOINTMENT',
  CUSTOM = 'CUSTOM',
}

export enum Channel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  EXTENSION = 'EXTENSION',
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: Priority;
  status: Status;
  categoryId: string | null;
  category: Category | null;
  reminders: Reminder[];
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  userId: string;
  title: string;
  location: string | null;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  description: string | null;
  reminders: Reminder[];
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  type: ReminderType;
  taskId: string | null;
  appointmentId: string | null;
  remindAt: string;
  sentAt: string | null;
  channel: Channel;
  createdAt: string;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  color: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: Priority;
  categoryId?: string;
  reminders?: { remindAt: string; channel?: Channel }[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: Priority;
  status?: Status;
  categoryId?: string | null;
}

export interface CreateAppointmentInput {
  title: string;
  location?: string;
  startTime: string;
  endTime?: string;
  allDay?: boolean;
  description?: string;
  reminders?: { remindAt: string; channel?: Channel }[];
}

export interface UpdateAppointmentInput {
  title?: string;
  location?: string | null;
  startTime?: string;
  endTime?: string | null;
  allDay?: boolean;
  description?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface WebSocketMessage {
  type: 'reminder:trigger' | 'task:update' | 'appointment:update' | 'ping' | 'pong';
  payload: unknown;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
