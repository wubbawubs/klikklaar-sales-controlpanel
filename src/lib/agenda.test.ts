import { describe, it, expect } from 'vitest';
import { groupAppointments } from './agenda';

const at = (d: Date) => ({ starts_at: d.toISOString() });

describe('groupAppointments', () => {
  // Wednesday 2026-09-30 14:00 local
  const now = new Date(2026, 8, 30, 14, 0);

  it('puts earlier-today items in overdue and later-today in today', () => {
    const g = groupAppointments([at(new Date(2026, 8, 30, 9, 0)), at(new Date(2026, 8, 30, 16, 0))], now);
    expect(g.overdue).toHaveLength(1);
    expect(g.today).toHaveLength(1);
  });

  it('uses Monday week start: Sunday 23:30 is this week, Monday 00:15 is later', () => {
    const g = groupAppointments([at(new Date(2026, 9, 4, 23, 30)), at(new Date(2026, 9, 5, 0, 15))], now);
    expect(g.thisWeek).toHaveLength(1);
    expect(g.later).toHaveLength(1);
  });

  it('sorts overdue newest-last and others ascending', () => {
    const a = at(new Date(2026, 8, 28, 10, 0));
    const b = at(new Date(2026, 8, 29, 10, 0));
    const g = groupAppointments([b, a], now);
    expect(g.overdue.map(x => x.starts_at)).toEqual([a.starts_at, b.starts_at]);
  });
});
