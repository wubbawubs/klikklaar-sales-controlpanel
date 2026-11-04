import { useMemo, useState } from 'react';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTeamMembers } from '@/hooks/useBoards';
import { useTasks } from '@/hooks/useTasks';
import { taskBucket, sortTasks, localToday, type TaskBucket } from '@/lib/tasks';
import { TASK_TYPE_LABEL, TASK_PRIORITY_LABEL, type Task, type TaskType, type TaskPriority } from '@/lib/crmTypes';
import { TaskRow, TaskQuickAdd } from '@/components/tasks';
import { PILL_SELECT } from '@/components/tasks/taskFormat';
import { cn } from '@/lib/utils';

type Scope = 'mine' | 'all';
const OPEN_GROUPS: { key: Exclude<TaskBucket, 'closed'>; label: string }[] = [
  { key: 'overdue', label: 'Achterstallig' },
  { key: 'today', label: 'Vandaag' },
  { key: 'upcoming', label: 'Binnenkort' },
  { key: 'nodate', label: 'Zonder datum' },
];
const CLOSED_LIMIT = 30;

function ScopeToggle({ value, onChange }: { value: Scope; onChange: (s: Scope) => void }) {
  const opt = (v: Scope, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={cn(
        'rounded-full px-3 py-1 text-[12px] transition-colors motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        value === v
          ? 'bg-white font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-muted'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Weergave" className="flex rounded-full bg-black/[0.05] p-0.5 dark:bg-white/[0.07]">
      {opt('mine', 'Mijn taken')}
      {opt('all', 'Alle taken')}
    </div>
  );
}

function Group({ label, count, accent, children }: { label: string; count: number; accent?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="glass !rounded-[20px] p-1.5">
      <h2 className="flex items-center gap-2 px-3 pb-1 pt-2 text-[12px] font-semibold text-muted-foreground">
        {accent && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />}
        <span className={cn(accent && 'text-rose-600 dark:text-rose-300')}>{label}</span>
        <span className="tabular-nums font-normal text-muted-foreground/70">{count}</span>
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const { isAllView } = useOrganization();
  const { data: team = [] } = useTeamMembers();
  const [scope, setScope] = useState<Scope>('mine');
  const [type, setType] = useState<TaskType | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [owner, setOwner] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const { data: tasks = [], isLoading } = useTasks({
    ownerId: scope === 'mine' ? user?.id : undefined,
    includeClosed: true,
  });

  const nameOf = useMemo(() => {
    const m = new Map(team.map(t => [t.user_id, t.full_name || t.email || null]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [team]);

  const today = localToday();
  const { groups, closed, openCount } = useMemo(() => {
    const filtered = tasks.filter(t =>
      (!type || t.type === type) &&
      (!priority || t.priority === priority) &&
      (scope === 'mine' || !owner || (owner === 'none' ? !t.owner_id : t.owner_id === owner)));
    const g: Record<TaskBucket, Task[]> = { overdue: [], today: [], upcoming: [], nodate: [], closed: [] };
    for (const t of sortTasks(filtered, today)) g[taskBucket(t, today)].push(t);
    const closedSorted = [...g.closed]
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at))
      .slice(0, CLOSED_LIMIT);
    return { groups: g, closed: closedSorted, openCount: filtered.length - g.closed.length };
  }, [tasks, type, priority, owner, scope, today]);

  if (isAllView) {
    return (
      <div className="px-4 pb-4 pt-3 lg:px-0">
        <div className="glass p-8 text-center text-sm text-muted-foreground">
          Kies een organisatie om taken te bekijken.
        </div>
      </div>
    );
  }

  const ownerProp = (t: Task) => (scope === 'all' ? nameOf(t.owner_id) : undefined);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pb-8 pt-3 lg:px-0">
      <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 !rounded-[22px] py-2 pl-4 pr-2 shadow-[0_8px_30px_-12px_rgba(30,50,40,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none sm:!rounded-full">
        <h1 className="text-[17px] font-semibold tracking-[-0.015em] text-foreground">Taken</h1>
        <ScopeToggle value={scope} onChange={s => { setScope(s); setOwner(''); }} />
        <div className="hidden flex-1 sm:block" />
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter op type" value={type} onChange={e => setType(e.target.value as TaskType | '')} className={PILL_SELECT}>
            <option value="">Alle types</option>
            {Object.entries(TASK_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label="Filter op prioriteit" value={priority} onChange={e => setPriority(e.target.value as TaskPriority | '')} className={PILL_SELECT}>
            <option value="">Alle prioriteiten</option>
            {Object.entries(TASK_PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {scope === 'all' && (
            <select aria-label="Filter op eigenaar" value={owner} onChange={e => setOwner(e.target.value)} className={PILL_SELECT}>
              <option value="">Iedereen</option>
              <option value="none">Zonder eigenaar</option>
              {team.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || 'Onbekend'}</option>)}
            </select>
          )}
        </div>
      </div>

      <TaskQuickAdd />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
        </div>
      ) : (
        <>
          {openCount === 0 && (
            <div className="glass flex flex-col items-center gap-2 !rounded-[20px] p-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-primary/70" aria-hidden />
              <p className="text-sm font-medium text-foreground">Alles is afgerond</p>
              <p className="text-[12.5px] text-muted-foreground">Geen openstaande taken. Voeg hierboven een nieuwe taak toe.</p>
            </div>
          )}

          {OPEN_GROUPS.map(({ key, label }) => groups[key].length > 0 && (
            <Group key={key} label={label} count={groups[key].length} accent={key === 'overdue'}>
              {groups[key].map(t => <TaskRow key={t.id} task={t} ownerName={ownerProp(t)} />)}
            </Group>
          ))}

          {closed.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={showClosed}
                onClick={() => setShowClosed(v => !v)}
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', showClosed && 'rotate-90')} aria-hidden />
                Afgerond <span className="tabular-nums font-normal">{closed.length}</span>
              </button>
              {showClosed && (
                <section aria-label="Afgerond" className="glass !rounded-[20px] p-1.5 opacity-90">
                  {closed.map(t => <TaskRow key={t.id} task={t} ownerName={ownerProp(t)} />)}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
