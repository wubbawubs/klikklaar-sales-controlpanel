import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Briefcase, Building2, User, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateTask } from '@/hooks/useTasks';
import { taskBucket, localToday } from '@/lib/tasks';
import { TASK_TYPE_LABEL, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type Task } from '@/lib/crmTypes';
import { initials } from '@/components/funnel/funnelFormat';
import { cn } from '@/lib/utils';
import { TaskDialog } from './TaskDialog';
import { TASK_TYPE_ICON, PRIORITY_DOT, formatDue } from './taskFormat';

export type TaskLinkKind = 'deal' | 'company' | 'contact';

export interface TaskRowProps {
  task: Task;
  /** Shown as an avatar (e.g. under "Alle taken"). */
  ownerName?: string | null;
  /** Link chips to leave out, e.g. ['deal'] inside the deal panel. */
  hideLinks?: TaskLinkKind[];
  /** Override the default (built-in TaskDialog) when the row is clicked. */
  onOpen?: (task: Task) => void;
  className?: string;
}

const CHIP = 'inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11.5px] text-muted-foreground dark:bg-white/[0.06]';

export function TaskRow({ task, ownerName, hideLinks = [], onOpen, className }: TaskRowProps) {
  const update = useUpdateTask();
  const [open, setOpen] = useState(false);
  const today = localToday();
  const closed = task.status === 'done' || task.status === 'cancelled';
  const done = task.status === 'done';
  const overdue = taskBucket(task, today) === 'overdue';
  const TypeIcon = TASK_TYPE_ICON[task.type];

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    update.mutate(
      { id: task.id, patch: { status: done ? 'open' : 'done' } },
      { onError: (err: Error) => toast.error(`Bijwerken mislukt: ${err.message}`) },
    );
  };
  const openDialog = () => (onOpen ? onOpen(task) : setOpen(true));
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const show = (k: TaskLinkKind) => !hideLinks.includes(k);

  return (
    <>
      <div
        onClick={openDialog}
        className={cn(
          'group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors motion-reduce:transition-none',
          'hover:bg-white/60 dark:hover:bg-white/[0.04]',
          className,
        )}
      >
        <button
          type="button"
          onClick={toggle}
          disabled={update.isPending}
          aria-label={done ? 'Markeer als open' : 'Markeer als afgerond'}
          aria-pressed={done}
          className={cn(
            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            done
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 text-transparent hover:border-primary hover:text-primary/60',
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openDialog(); }}
            className={cn(
              'block max-w-full truncate text-left text-[13.5px] font-medium text-foreground focus-visible:outline-none focus-visible:underline',
              closed && 'text-muted-foreground line-through decoration-muted-foreground/50',
            )}
          >
            {task.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
            {task.due_date && (
              <span
                className={cn(CHIP, 'tabular-nums', overdue && 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300')}
                title={overdue ? 'Achterstallig' : undefined}
              >
                <CalendarDays className="h-3 w-3" aria-hidden />
                {formatDue(task.due_date, today)}{task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ''}
              </span>
            )}
            {task.status !== 'open' && !closed && (
              <span className={cn(CHIP, 'text-foreground/70')}>{TASK_STATUS_LABEL[task.status]}</span>
            )}
            {show('deal') && task.deal_id && task.deal && (
              task.deal.funnel_id ? (
                <Link to={`/pipeline/${task.deal.funnel_id}?deal=${task.deal_id}`} onClick={stop} className={cn(CHIP, 'hover:text-foreground hover:bg-black/[0.07] dark:hover:bg-white/10')}>
                  <Briefcase className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{task.deal.title}</span>
                </Link>
              ) : (
                <span className={CHIP}><Briefcase className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{task.deal.title}</span></span>
              )
            )}
            {show('company') && task.company && (
              <span className={CHIP}><Building2 className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{task.company.name}</span></span>
            )}
            {show('contact') && task.contact && (
              <span className={CHIP}><User className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{task.contact.name}</span></span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 text-muted-foreground">
          <span title={`Prioriteit: ${TASK_PRIORITY_LABEL[task.priority]}`} className="flex items-center">
            <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[task.priority])} aria-hidden />
            <span className="sr-only">Prioriteit {TASK_PRIORITY_LABEL[task.priority]}</span>
          </span>
          <span title={TASK_TYPE_LABEL[task.type]}>
            <TypeIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{TASK_TYPE_LABEL[task.type]}</span>
          </span>
          {ownerName !== undefined && (
            <span
              title={ownerName ?? 'Niemand'}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
            >
              {ownerName ? initials(ownerName) : '–'}
            </span>
          )}
        </div>
      </div>
      {!onOpen && open && <TaskDialog open={open} onOpenChange={setOpen} task={task} />}
    </>
  );
}
