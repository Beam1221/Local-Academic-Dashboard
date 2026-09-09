import type { FocusInput } from "../types";

export const WORK_MS = 25 * 60 * 1000;
export const BREAK_MS = 5 * 60 * 1000;
export const TIMER_KEY = "studyspace-timer-v1";
export interface TimerState {
  mode: "work" | "break";
  taskId: number | null;
  remainingMs: number;
  runningSince: number | null;
  startedAt: number | null;
  sessionId: string;
  pending: FocusInput[];
}

export function sessionId() {
  // getRandomValues also works on a plain HTTP local-network origin.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function freshTimer(
  mode: "work" | "break" = "work",
  taskId: number | null = null,
  pending: FocusInput[] = [],
): TimerState {
  return {
    mode,
    taskId,
    remainingMs: mode === "work" ? WORK_MS : BREAK_MS,
    runningSince: null,
    startedAt: null,
    sessionId: sessionId(),
    pending,
  };
}
export function remaining(state: TimerState, now: number) {
  return Math.max(
    0,
    state.remainingMs -
      (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince)),
  );
}
export function startTimer(state: TimerState, now: number): TimerState {
  return state.runningSince !== null
    ? state
    : { ...state, runningSince: now, startedAt: state.startedAt ?? now };
}
export function finishTimer(state: TimerState, now: number): TimerState {
  const left = remaining(state, now);
  const elapsed = Math.floor((WORK_MS - left) / 1000);
  const ended =
    state.runningSince !== null && left === 0
      ? state.runningSince + state.remainingMs
      : now;
  let pending = state.pending;
  if (
    state.mode === "work" &&
    state.startedAt !== null &&
    elapsed > 0 &&
    !pending.some((item) => item.client_session_id === state.sessionId)
  ) {
    pending = [
      ...pending,
      {
        client_session_id: state.sessionId,
        task_id: state.taskId,
        started_at: new Date(state.startedAt).toISOString(),
        ended_at: new Date(ended).toISOString(),
        elapsed_seconds: Math.min(1500, elapsed),
      },
    ];
  }
  return freshTimer(
    state.mode === "work" ? "break" : "work",
    state.taskId,
    pending,
  );
}
export function pauseTimer(state: TimerState, now: number): TimerState {
  if (remaining(state, now) === 0) return finishTimer(state, now);
  return { ...state, remainingMs: remaining(state, now), runningSince: null };
}
export function readTimer(): TimerState {
  try {
    const value = JSON.parse(
      localStorage.getItem(TIMER_KEY) || "null",
    ) as TimerState | null;
    if (
      value &&
      ["work", "break"].includes(value.mode) &&
      typeof value.sessionId === "string" &&
      Number.isFinite(value.remainingMs) &&
      value.remainingMs >= 0 &&
      value.remainingMs <= (value.mode === "work" ? WORK_MS : BREAK_MS) &&
      (value.taskId === null || Number.isInteger(value.taskId)) &&
      (value.runningSince === null || Number.isFinite(value.runningSince)) &&
      (value.startedAt === null || Number.isFinite(value.startedAt)) &&
      Array.isArray(value.pending)
    )
      return value;
  } catch {
    /* The timer can still run without browser storage. */
  }
  return freshTimer();
}
