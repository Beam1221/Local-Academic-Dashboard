import { format, isValid, parseISO, startOfDay } from 'date-fns';
import type { Task } from '../types';
import { request } from './api';

export interface Todo { id: number; title: string; scheduled_for: string; progress: number; task_id: number | null }
export const dayKey = (date = new Date()) => format(date, 'yyyy-MM-dd');
export function planDate(today: string, saved: string | null) {
  return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) && isValid(parseISO(saved)) && saved >= today ? saved : today;
}
export function suggestions(tasks: Task[], day: string, now = new Date()) {
  const earliest = Math.max(now.getTime(), startOfDay(parseISO(day)).getTime());
  const latest = now.getTime() + 7 * 86400000;
  return tasks.filter(t => t.status !== 'completed' && Date.parse(t.due_at) >= earliest && Date.parse(t.due_at) < latest)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
}
const offset = () => -new Date().getTimezoneOffset();
export const planner = {
  list: (day: string) => request<Todo[]>(`/todos?day=${day}&utc_offset_minutes=${offset()}`),
  add: (title: string, scheduled_for: string, task_id: number | null = null) => request<Todo>('/todos', 'POST', { title, scheduled_for, task_id, utc_offset_minutes: offset() }),
  update: (id: number, value: Partial<Pick<Todo, 'title' | 'progress' | 'scheduled_for'>>) => request<Todo>(`/todos/${id}`, 'PATCH', { ...value, utc_offset_minutes: offset() }),
  remove: (id: number) => request<void>(`/todos/${id}`, 'DELETE'),
};
