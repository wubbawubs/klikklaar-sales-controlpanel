import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembers } from '@/hooks/useBoards';
import { useCreateTask, useUpdateTask, useDeleteTask, useTaskLinkOptions, type TaskInput } from '@/hooks/useTasks';
import {
  TASK_STATUS_LABEL, TASK_TYPE_LABEL, TASK_PRIORITY_LABEL,
  type Task, type TaskStatus, type TaskType, type TaskPriority,
} from '@/lib/crmTypes';
import { cn } from '@/lib/utils';

/** Pre-filled links/owner for a new task (deal panel, company panel, dashboard...). */
export interface TaskDefaults { dealId?: string | null; companyId?: string | null; contactId?: string | null; ownerId?: string | null }

export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing task to edit; omit to create a new one. */
  task?: Task | null;
  defaults?: TaskDefaults;
}

const FIELD = 'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const LABEL = 'text-xs font-medium text-muted-foreground';

export function TaskDialog(props: TaskDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Mount the form (and its option queries) only while open; remount per task. */}
      {props.open && <TaskForm key={props.task?.id ?? 'new'} {...props} />}
    </Dialog>
  );
}

function TaskForm({ onOpenChange, task, defaults = {} }: TaskDialogProps) {
  const { user } = useAuth();
  const { data: team = [] } = useTeamMembers();
  const links = useTaskLinkOptions(true);
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [type, setType] = useState<TaskType>(task?.type ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'open');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0, 5) ?? '');
  const [ownerId, setOwnerId] = useState(task ? task.owner_id ?? '' : defaults.ownerId ?? user?.id ?? '');
  const [dealId, setDealId] = useState(task ? task.deal_id ?? '' : defaults.dealId ?? '');
  const [companyId, setCompanyId] = useState(task ? task.company_id ?? '' : defaults.companyId ?? '');
  const [contactId, setContactId] = useState(task ? task.contact_id ?? '' : defaults.contactId ?? '');

  const busy = create.isPending || update.isPending || del.isPending;
  const onError = (err: Error) => toast.error(`Opslaan mislukt: ${err.message}`);
  const close = () => onOpenChange(false);

  // Keep the current link selectable even if it is not (yet) in the option list.
  const withCurrent = <T extends { id: string }>(opts: T[], id: string, label: string | undefined, make: (id: string, l: string) => T) =>
    id && !opts.some(o => o.id === id) ? [make(id, label ?? '(gekoppeld)'), ...opts] : opts;
  const dealOpts = withCurrent(links.deals, dealId, task?.deal?.title, (id, l) => ({ id, title: l, funnel_id: null }));
  const companyOpts = withCurrent(links.companies, companyId, task?.company?.name, (id, l) => ({ id, name: l }));
  const contactOpts = withCurrent(links.contacts, contactId, task?.contact?.name, (id, l) => ({ id, name: l, email: null, title: null, company_id: null }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const body: TaskInput = {
      title: t, notes: notes.trim() || null, type, priority,
      due_date: dueDate || null, due_time: dueDate && dueTime ? dueTime : null,
      owner_id: ownerId || null, deal_id: dealId || null, company_id: companyId || null, contact_id: contactId || null,
    };
    if (task) {
      // Only send status when it changed, so completed_at is not re-stamped on every save.
      const patch: Partial<TaskInput> = status !== task.status ? { ...body, status } : body;
      update.mutate({ id: task.id, patch }, { onSuccess: close, onError });
    } else {
      create.mutate({ ...body, status }, { onSuccess: () => { toast.success('Taak aangemaakt'); close(); }, onError });
    }
  };

  const remove = () => {
    if (!task) return;
    del.mutate(task.id, { onSuccess: close, onError: (err: Error) => toast.error(`Verwijderen mislukt: ${err.message}`) });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{task ? 'Taak bewerken' : 'Nieuwe taak'}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="grid gap-3 py-1">
        <div className="grid gap-1.5">
          <label htmlFor="task-title" className={LABEL}>Titel</label>
          <Input id="task-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus required placeholder="Wat moet er gebeuren?" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="task-type" className={LABEL}>Type</label>
            <select id="task-type" className={FIELD} value={type} onChange={e => setType(e.target.value as TaskType)}>
              {Object.entries(TASK_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="task-priority" className={LABEL}>Prioriteit</label>
            <select id="task-priority" className={FIELD} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
              {Object.entries(TASK_PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="task-status" className={LABEL}>Status</label>
            <select id="task-status" className={FIELD} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
              {Object.entries(TASK_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="task-due" className={LABEL}>Datum</label>
            <input id="task-due" type="date" className={cn(FIELD, 'tabular-nums')} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="task-time" className={LABEL}>Tijd</label>
            <input id="task-time" type="time" className={cn(FIELD, 'tabular-nums')} value={dueTime} disabled={!dueDate} onChange={e => setDueTime(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="task-owner" className={LABEL}>Eigenaar</label>
            <select id="task-owner" className={FIELD} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">Niemand</option>
              {team.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || 'Onbekend'}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="task-deal" className={LABEL}>Deal</label>
          <select id="task-deal" className={FIELD} value={dealId} onChange={e => setDealId(e.target.value)}>
            <option value="">Geen deal</option>
            {dealOpts.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="task-company" className={LABEL}>Bedrijf</label>
            <select id="task-company" className={FIELD} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">Geen bedrijf</option>
              {companyOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="task-contact" className={LABEL}>Contact</label>
            <select id="task-contact" className={FIELD} value={contactId} onChange={e => setContactId(e.target.value)}>
              <option value="">Geen contact</option>
              {contactOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="task-notes" className={LABEL}>Notities</label>
          <Textarea id="task-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <DialogFooter className="mt-1 gap-2 sm:justify-between">
          {task ? (
            <Button type="button" variant="ghost" onClick={remove} disabled={busy} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Verwijderen
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close}>Annuleren</Button>
            <Button type="submit" disabled={busy || !title.trim()}>{task ? 'Opslaan' : 'Toevoegen'}</Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
