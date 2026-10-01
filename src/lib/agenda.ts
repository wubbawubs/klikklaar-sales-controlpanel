import { endOfDay, endOfWeek } from 'date-fns';

export interface AgendaGroups<T> { overdue: T[]; today: T[]; thisWeek: T[]; later: T[] }

// Local calendar days, week starts Monday (NL).
export function groupAppointments<T extends { starts_at: string }>(items: T[], now: Date): AgendaGroups<T> {
  const todayEnd = endOfDay(now).getTime();
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).getTime();
  const sorted = [...items].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const g: AgendaGroups<T> = { overdue: [], today: [], thisWeek: [], later: [] };
  for (const it of sorted) {
    const t = new Date(it.starts_at).getTime();
    if (t < now.getTime()) g.overdue.push(it);
    else if (t <= todayEnd) g.today.push(it);
    else if (t <= weekEnd) g.thisWeek.push(it);
    else g.later.push(it);
  }
  return g;
}
