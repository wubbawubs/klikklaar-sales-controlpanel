import { describe, it, expect, vi, afterEach } from 'vitest';
import { taskBucket, localToday, sortTasks } from './tasks';
import type { Task } from './crmTypes';

const t = (o: Partial<Task>): Task => ({
  id: 'x', org_id: 'o', title: 't', notes: null, type: 'todo', priority: 'medium', status: 'open',
  due_date: null, due_time: null, owner_id: null, deal_id: null, company_id: null, contact_id: null,
  completed_at: null, completed_by: null, created_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '', ...o,
});

describe('taskBucket', () => {
  const today = '2026-11-05';
  it('closed for done/cancelled even when overdue', () => {
    expect(taskBucket(t({ status: 'done', due_date: '2026-01-01' }), today)).toBe('closed');
    expect(taskBucket(t({ status: 'cancelled' }), today)).toBe('closed');
  });
  it('nodate / overdue / today / upcoming', () => {
    expect(taskBucket(t({}), today)).toBe('nodate');
    expect(taskBucket(t({ due_date: '2026-11-04' }), today)).toBe('overdue');
    expect(taskBucket(t({ due_date: '2026-11-05' }), today)).toBe('today');
    expect(taskBucket(t({ due_date: '2026-11-06' }), today)).toBe('upcoming');
    expect(taskBucket(t({ status: 'waiting', due_date: '2026-11-06' }), today)).toBe('upcoming');
  });
});

describe('localToday', () => {
  afterEach(() => vi.useRealTimers());
  it('uses local date at 23:30 and 00:30', () => {
    expect(localToday(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
    expect(localToday(new Date(2026, 10, 6, 0, 30))).toBe('2026-11-06');
  });
  it('defaults to the current (fake) time', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 5, 23, 30));
    expect(localToday()).toBe('2026-11-05');
    expect(taskBucket(t({ due_date: '2026-11-05' }), localToday())).toBe('today');
  });
});

describe('sortTasks', () => {
  it('orders by bucket, due date, priority, created_at', () => {
    const today = '2026-11-05';
    const list = [
      t({ id: 'closed', status: 'done', due_date: '2026-11-01' }),
      t({ id: 'nodate' }),
      t({ id: 'up2', due_date: '2026-11-10' }),
      t({ id: 'up1', due_date: '2026-11-07' }),
      t({ id: 'todayLow', due_date: today, priority: 'low' }),
      t({ id: 'todayHigh', due_date: today, priority: 'high' }),
      t({ id: 'todayHighLater', due_date: today, priority: 'high', created_at: '2026-02-01T00:00:00Z' }),
      t({ id: 'over', due_date: '2026-11-01' }),
    ];
    expect(sortTasks(list, today).map(x => x.id)).toEqual(
      ['over', 'todayHigh', 'todayHighLater', 'todayLow', 'up1', 'up2', 'nodate', 'closed']);
  });
});
