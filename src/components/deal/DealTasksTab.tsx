import { useTasks } from '@/hooks/useTasks';
import { sortTasks } from '@/lib/tasks';
import { TaskRow, TaskQuickAdd } from '@/components/tasks';

/** Open tasks linked to one deal, with quick add prefilled with the deal (and its company). */
export function DealTasksTab({ dealId, companyId }: { dealId: string; companyId?: string | null }) {
  const { data: tasks = [] } = useTasks({ dealId });
  return (
    <div className="space-y-3">
      <TaskQuickAdd defaults={{ dealId, companyId: companyId ?? undefined }} />
      {tasks.length === 0
        ? <p className="text-xs text-muted-foreground">Geen open taken voor deze deal</p>
        : <ul className="space-y-1">{sortTasks(tasks).map(t => <li key={t.id}><TaskRow task={t} hideLinks={['deal']} /></li>)}</ul>}
    </div>
  );
}
