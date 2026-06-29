export function formatDate(date: string | Date, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone || 'UTC',
  }).format(d);
}

export function isOverdue(dueDate: string | Date | null): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return d.getTime() < Date.now();
}

export function isToday(date: string | Date | null): boolean {
  if (!date) return false;
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function getUrgencyColor(dueDate: string | Date | null, status: string): string {
  if (status === 'COMPLETED' || status === 'CANCELLED') return '#22c55e'; // green
  if (!dueDate) return '#3b82f6'; // blue
  if (isOverdue(dueDate)) return '#ef4444'; // red
  if (isToday(dueDate)) return '#f59e0b'; // yellow
  return '#3b82f6'; // blue
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}
