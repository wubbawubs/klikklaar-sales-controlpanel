import { Phone, Mail, ListTodo, type LucideIcon } from 'lucide-react';
import type { TaskType, TaskPriority } from '@/lib/crmTypes';
import { localToday } from '@/lib/tasks';

export const TASK_TYPE_ICON: Record<TaskType, LucideIcon> = { call: Phone, email: Mail, todo: ListTodo };

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-300 dark:bg-slate-500',
};

/** Parse a plain yyyy-mm-dd as a LOCAL date (never via UTC). */
const parsePlain = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
};

/** "Vandaag", "Morgen", "Gisteren", "ma 10 nov" (year added when not this year). */
export function formatDue(due: string, today: string = localToday()): string {
  const diff = Math.round((parsePlain(due).getTime() - parsePlain(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gisteren';
  const d = parsePlain(due);
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Shared pill-select style (Glass A). */
export const PILL_SELECT =
  'h-8 rounded-full border-0 bg-black/[0.05] px-3 text-[12.5px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/[0.07]';
