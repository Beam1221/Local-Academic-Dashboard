import { describe, expect, it } from "vitest";
import { deadlineGroups, matrixQuadrant } from "./dates";
import {
  BREAK_MS,
  finishTimer,
  freshTimer,
  pauseTimer,
  remaining,
  startTimer,
  WORK_MS,
} from "./timer";
import type { Task } from "../types";

function task(id: number, date: Date, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: "Essay",
    course_id: 1,
    due_at: date.toISOString(),
    task_type: "assignment",
    status: "not_started",
    priority: "medium",
    description: "",
    subtasks: [],
    checklist_progress: 0,
    focus_seconds: 0,
    ...overrides,
  };
}

describe("deadline groups", () => {
  it("uses calendar day boundaries and excludes completed work", () => {
    const now = new Date(2026, 8, 9, 12);
    const items = [
      task(1, new Date(2026, 8, 9, 10)),
      task(2, new Date(2026, 8, 9, 23, 59)),
      task(3, new Date(2026, 8, 10)),
      task(4, new Date(2026, 8, 16, 23, 59)),
      task(5, new Date(2026, 8, 17)),
      task(6, new Date(2026, 8, 9, 8), { status: "completed" }),
    ];
    const groups = deadlineGroups(items, now);
    expect(groups.today.map((t) => t.id)).toEqual([1, 2]);
    expect(groups.overdue.map((t) => t.id)).toEqual([1]);
    expect(groups.next.map((t) => t.id)).toEqual([3, 4]);
  });
  it("handles a month and year boundary", () => {
    const groups = deadlineGroups(
      [
        task(1, new Date(2027, 0, 1, 8)),
        task(2, new Date(2027, 0, 7, 23, 59)),
        task(3, new Date(2027, 0, 8)),
      ],
      new Date(2026, 11, 31, 12),
    );
    expect(groups.next.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("priority matrix", () => {
  it("classifies overdue and 48-hour boundary tasks into all four quadrants", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    expect(
      matrixQuadrant(
        task(1, new Date("2026-09-08T12:00:00Z"), { priority: "high" }),
        now,
      ),
    ).toBe(0);
    expect(
      matrixQuadrant(
        task(2, new Date("2026-09-11T12:00:00Z"), { priority: "high" }),
        now,
      ),
    ).toBe(0);
    expect(
      matrixQuadrant(
        task(3, new Date("2026-09-11T12:00:01Z"), { priority: "high" }),
        now,
      ),
    ).toBe(1);
    expect(matrixQuadrant(task(4, now), now)).toBe(2);
    expect(matrixQuadrant(task(5, new Date("2026-09-15T12:00:00Z")), now)).toBe(
      3,
    );
  });
});

describe("persistent focus timer", () => {
  const base = Date.parse("2026-09-09T12:00:00Z");
  it("excludes paused time and records only elapsed work", () => {
    const started = startTimer(freshTimer("work", 42), base);
    const paused = pauseTimer(started, base + 60_000);
    expect(remaining(paused, base + 600_000)).toBe(WORK_MS - 60_000);
    const resumed = startTimer(paused, base + 600_000);
    const finished = finishTimer(resumed, base + 660_000);
    expect(finished.pending[0].elapsed_seconds).toBe(120);
    expect(finished.pending[0].task_id).toBe(42);
    expect(finished.mode).toBe("break");
    expect(finished.runningSince).toBeNull();
  });
  it("caps a delayed wake-up at the actual scheduled work deadline", () => {
    const started = startTimer(freshTimer("work"), base);
    const restored = JSON.parse(JSON.stringify(started));
    const finished = finishTimer(restored, base + WORK_MS + 3600_000);
    expect(finished.pending[0].elapsed_seconds).toBe(1500);
    expect(finished.pending[0].ended_at).toBe(
      new Date(base + WORK_MS).toISOString(),
    );
    expect(finished.remainingMs).toBe(BREAK_MS);
    expect(finished.runningSince).toBeNull();
  });
  it("never counts a break as work", () => {
    const result = finishTimer(
      startTimer(freshTimer("break"), base),
      base + BREAK_MS,
    );
    expect(result.pending).toHaveLength(0);
    expect(result.mode).toBe("work");
  });
  it("preserves queued sessions and skips sub-second sessions", () => {
    const first = finishTimer(startTimer(freshTimer(), base), base + 60_000);
    const next = freshTimer("work", null, first.pending);
    const result = finishTimer(startTimer(next, base + 60_000), base + 60_500);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].elapsed_seconds).toBe(60);
  });
  it("uses one stable client ID through pause and resume", () => {
    const start = startTimer(freshTimer(), base);
    const paused = pauseTimer(start, base + 15_000);
    const resumed = startTimer(paused, base + 30_000);
    const saved = finishTimer(resumed, base + 60_000);
    expect(saved.pending[0].client_session_id).toBe(start.sessionId);
    expect(saved.pending[0].elapsed_seconds).toBe(45);
  });
  it("finishes an expired interval if Pause is pressed after its deadline", () => {
    const started = startTimer(freshTimer(), base);
    const paused = pauseTimer(started, base + WORK_MS + 1000);
    expect(paused.mode).toBe("break");
    expect(paused.pending[0].elapsed_seconds).toBe(1500);
  });
});
