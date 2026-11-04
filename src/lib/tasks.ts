import type { Task } from '@/lib/crmTypes';

export type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'nodate' | 'closed';
const BUCKET_ORDER: TaskBucket[] = ['overdue', 'today', 'upcoming', 'nodate', 'closed'];
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Today's date as yyyy-mm-dd in the user's LOCAL time (never UTC). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function taskBucket(task: Pick<Task, 'status' | 'due_date'>, today: string): TaskBucket {
  if (task.status === 'done' || task.status === 'cancelled') return 'closed';
  if (!task.due_date) return 'nodate';
  if (task.due_date < today) return 'overdue';
  if (task.due_date === today) return 'today';
  return 'upcoming';
}

export function sortTasks<T extends Task>(tasks: T[], today: string = localToday()): T[] {
  return [...tasks].sort((a, b) => {
    const ba = BUCKET_ORDER.indexOf(taskBucket(a, today));
    const bb = BUCKET_ORDER.indexOf(taskBucket(b, today));
    if (ba !== bb) return ba - bb;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    const pa = PRIORITY_ORDER[a.priority], pb = PRIORITY_ORDER[b.priority];
    if (pa !== pb) return pa - pb;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}
