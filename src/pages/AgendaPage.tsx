import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Users } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAgenda, type Appointment } from '@/hooks/useAppointments';
import { useAuth } from '@/hooks/useAuth';
import { groupAppointments } from '@/lib/agenda';
import { AppointmentActions, fmtWhen } from '@/components/deal/AppointmentsPanel';

const GROUPS = [
  { key: 'overdue', label: 'Achterstallig' }, { key: 'today', label: 'Vandaag' },
  { key: 'thisWeek', label: 'Deze week' }, { key: 'later', label: 'Later' },
] as const;

export default function AgendaPage() {
  const { user } = useAuth();
  const { data = [], isLoading } = useAgenda();
  const navigate = useNavigate();
  const [who, setWho] = useState<'mine' | 'all'>('mine');
  const [kind, setKind] = useState<'all' | 'call' | 'meeting'>('all');

  const filtered = data.filter(a => (who === 'all' || a.owner_id === user?.id) && (kind === 'all' || a.type === kind));
  const groups = groupAppointments(filtered, new Date());

  const Item = ({ a }: { a: Appointment }) => {
    const Icon = a.type === 'call' ? Phone : Users;
    return (
      <div className="rounded-lg border bg-card p-3">
        <button className="text-left w-full" onClick={() => a.deal_id && navigate(`/pipeline?deal=${a.deal_id}`)}>
          <p className="text-xs text-muted-foreground">{fmtWhen(a.starts_at)} · {a.duration_min} min</p>
          <p className="text-sm font-medium flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{a.title}</p>
          <p className="text-xs text-muted-foreground">{[a.company?.name, a.deal?.title].filter(Boolean).join(' · ')}</p>
        </button>
        <AppointmentActions appt={a} />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Agenda</h1>
        <div className="flex gap-2">
          <ToggleGroup type="single" size="sm" value={who} onValueChange={v => v && setWho(v as any)}>
            <ToggleGroupItem value="mine">Mijn</ToggleGroupItem><ToggleGroupItem value="all">Iedereen</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" size="sm" value={kind} onValueChange={v => v && setKind(v as any)}>
            <ToggleGroupItem value="all">Alles</ToggleGroupItem><ToggleGroupItem value="call">Calls</ToggleGroupItem><ToggleGroupItem value="meeting">Meetings</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {!isLoading && filtered.length === 0 && <p className="text-sm text-muted-foreground">Geen geplande afspraken. Plan er een vanuit een deal.</p>}
      {GROUPS.map(g => groups[g.key].length > 0 && (
        <section key={g.key} className="space-y-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${g.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}>{g.label} ({groups[g.key].length})</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{groups[g.key].map(a => <Item key={a.id} a={a} />)}</div>
        </section>
      ))}
    </div>
  );
}
