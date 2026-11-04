import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCreateTask } from '@/hooks/useTasks';
import { TASK_TYPE_LABEL, TASK_PRIORITY_LABEL, type TaskType, type TaskPriority } from '@/lib/crmTypes';
import { cn } from '@/lib/utils';
import type { TaskDefaults } from './TaskDialog';
import { PILL_SELECT } from './taskFormat';

export interface TaskQuickAddProps {
  /** Links (and optionally another owner) for the new task; owner defaults to me. */
  defaults?: TaskDefaults;
  placeholder?: string;
  className?: string;
}

export function TaskQuickAdd({ defaults = {}, placeholder = 'Nieuwe taak toevoegen…', className }: TaskQuickAddProps) {
  const { user } = useAuth();
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState<TaskType>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || create.isPending) return;
    create.mutate(
      {
        title: t, type, priority, status: 'open', due_date: dueDate || null,
        owner_id: defaults.ownerId ?? user?.id ?? null,
        deal_id: defaults.dealId ?? null, company_id: defaults.companyId ?? null, contact_id: defaults.contactId ?? null,
      },
      {
        onSuccess: () => { setTitle(''); setDueDate(''); },
        onError: (err: Error) => toast.error(`Taak toevoegen mislukt: ${err.message}`),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-2xl bg-white/50 p-1.5 ring-1 ring-black/[0.04] dark:bg-white/[0.03] dark:ring-white/[0.06]',
        className,
      )}
    >
      <div className="relative min-w-[12rem] flex-1">
        <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          aria-label="Nieuwe taak"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-xl border-0 bg-transparent pl-9 pr-2 text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <input
        type="date"
        aria-label="Datum"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        className={cn(PILL_SELECT, 'tabular-nums', !dueDate && 'text-muted-foreground')}
      />
      <select aria-label="Type" value={type} onChange={e => setType(e.target.value as TaskType)} className={PILL_SELECT}>
        {Object.entries(TASK_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select aria-label="Prioriteit" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className={PILL_SELECT}>
        {Object.entries(TASK_PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button
        type="submit"
        disabled={!title.trim() || create.isPending}
        className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground shadow-[0_4px_14px_-4px_hsl(var(--primary)),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:shadow-none"
      >
        Toevoegen
      </button>
    </form>
  );
}
