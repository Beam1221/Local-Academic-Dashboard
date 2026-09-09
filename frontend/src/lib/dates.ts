import { addDays, format, isSameDay, startOfDay } from "date-fns";
import type { Task } from "../types";

export function deadlineGroups(tasks: Task[], now = new Date()) {
  const active = tasks.filter((t) => t.status !== "completed");
  const tomorrow = addDays(startOfDay(now), 1);
  const end = addDays(startOfDay(now), 8);
  return {
    today: active.filter((t) => isSameDay(new Date(t.due_at), now)),
    next: active.filter(
      (t) => new Date(t.due_at) >= tomorrow && new Date(t.due_at) < end,
    ),
    overdue: active.filter((t) => new Date(t.due_at) < now),
  };
}

export function matrixQuadrant(task: Task, now = new Date()): number {
  const urgent =
    new Date(task.due_at).getTime() <= now.getTime() + 48 * 60 * 60 * 1000;
  const important = task.priority === "high";
  return important ? (urgent ? 0 : 1) : urgent ? 2 : 3;
}

export function localDateInput(value: string | Date) {
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}
export function dueLabel(value: string, now = new Date()) {
  const date = new Date(value);
  return isSameDay(date, now)
    ? `Today, ${format(date, "h:mm a")}`
    : format(date, "MMM d, h:mm a");
}
export function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
