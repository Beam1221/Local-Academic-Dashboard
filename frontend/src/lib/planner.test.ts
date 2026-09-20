import { describe, expect, it } from 'vitest';
import { planDate, suggestions } from './planner';
import type { Task } from '../types';

describe('daily plan date', () => {
  it('defaults to today, retains future choices, and drops expired choices', () => {
    expect(planDate('2026-09-11', null)).toBe('2026-09-11');
    expect(planDate('2026-09-11', '2026-09-14')).toBe('2026-09-14');
    expect(planDate('2026-09-15', '2026-09-14')).toBe('2026-09-15');
    expect(planDate('2026-09-11', '2026-99-99')).toBe('2026-09-11');
  });
});
describe('course reminders', () => {
  const now = new Date(2026, 8, 11, 12);
  const item = (id: number, hours: number, status = 'not_started') => ({ id, due_at: new Date(now.getTime() + hours * 3600000).toISOString(), status }) as Task;
  it('includes only unfinished future deadlines strictly less than seven days away', () => {
    expect(suggestions([item(1, -1), item(2, 1), item(3, 167), item(4, 168), item(5, 2, 'completed')], '2026-09-11', now).map(t => t.id)).toEqual([2, 3]);
  });
  it('does not recommend a deadline earlier than the selected plan date', () => {
    expect(suggestions([item(1, 1), item(2, 60)], '2026-09-13', now).map(t => t.id)).toEqual([2]);
    expect(suggestions([item(1, 100)], '2026-10-01', now)).toEqual([]);
  });
});
