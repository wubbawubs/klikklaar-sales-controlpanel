import { Link } from 'react-router-dom';
import { Phone, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { useAgenda } from '@/hooks/useAppointments';
import { localToday, sortTasks, taskBucket } from '@/lib/tasks';
import { TaskRow } from './TaskRow';

const MAX_TASKS = 8;

/** "Vandaag": my overdue + due-today tasks and today's planned appointments. */
export function TodayCard() {
  const { user } = useAuth();
  const { data: tasks = [] } = useTasks({ ownerId: user?.id });
  const { data: agenda = [] } = useAgenda();
  const today = localToday();

  const due = sortTasks(tasks.filter(t => ['overdue', 'today'].includes(taskBucket(t, today))), today);
  const shown = due.slice(0, MAX_TASKS);
  const appointments = agenda.filter(a => localToday(new Date(a.starts_at)) === today);
  const empty = shown.length === 0 && appointments.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Vandaag</CardTitle>
          <Link to="/taken" className="text-xs text-muted-foreground hover:text-foreground">Alle taken</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty && <p className="py-2 text-sm text-muted-foreground">Niets meer voor vandaag</p>}
        {appointments.length > 0 && (
          <ul className="space-y-1">
            {appointments.map(a => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                {a.type === 'call' ? <Phone className="h-3.5 w-3.5 text-muted-foreground" /> : <Users className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="tabular-nums text-muted-foreground">{new Date(a.starts_at).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="truncate">{a.title}</span>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 0 && <ul className="space-y-1">{shown.map(t => <li key={t.id}><TaskRow task={t} /></li>)}</ul>}
      </CardContent>
    </Card>
  );
}
