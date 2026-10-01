import { useState } from 'react';
import { Phone, Users, CalendarPlus, Check, CalendarClock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDealAppointments, useCompleteAppointment, useCancelAppointment, type Appointment } from '@/hooks/useAppointments';
import { useAuth } from '@/hooks/useAuth';
import { downloadIcs } from '@/lib/ics';
import type { Deal } from '@/hooks/usePipeline';
import { AppointmentDialog } from './AppointmentDialog';

export const fmtWhen = (s: string) => new Date(s).toLocaleString('nl', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AppointmentActions({ appt }: { appt: Appointment }) {
  const { user } = useAuth();
  const complete = useCompleteAppointment();
  const cancel = useCancelAppointment();
  const [outcome, setOutcome] = useState('');
  const [resched, setResched] = useState(false);
  const ics = () => downloadIcs({
    uid: appt.id, title: appt.title, start: new Date(appt.starts_at), durationMin: appt.duration_min,
    description: [appt.notes, appt.deal_id && `${window.location.origin}/pipeline?deal=${appt.deal_id}`].filter(Boolean).join('\n'),
    location: appt.location, organizerEmail: appt.owner_id === user?.id ? user?.email : null,
    attendeeEmail: appt.contact?.email ?? null, attendeeName: appt.contact?.name ?? null,
  });
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={ics}><CalendarPlus className="h-3.5 w-3.5" /> Outlook</Button>
      <Popover>
        <PopoverTrigger asChild><Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1"><Check className="h-3.5 w-3.5" /> Afronden</Button></PopoverTrigger>
        <PopoverContent className="w-72 space-y-2">
          <Textarea placeholder="Uitkomst (kort)" value={outcome} onChange={e => setOutcome(e.target.value)} className="min-h-[70px]" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={complete.isPending} onClick={() => complete.mutate({ appt, outcome, status: 'no_show' })}>No-show</Button>
            <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate({ appt, outcome, status: 'done' })}>Gedaan</Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setResched(true)}><CalendarClock className="h-3.5 w-3.5" /> Verzetten</Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(appt)}><X className="h-3.5 w-3.5" /> Annuleren</Button>
      <AppointmentDialog open={resched} onClose={() => setResched(false)} deal={null} type={appt.type} appointment={appt} />
    </div>
  );
}

export function AppointmentsPanel({ deal }: { deal: Deal }) {
  const { data = [] } = useDealAppointments(deal.id);
  const upcoming = data.filter(a => a.status === 'planned');
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Agenda</h3>
      {upcoming.length === 0 && <p className="text-xs text-muted-foreground">Geen geplande afspraken</p>}
      <div className="space-y-2">
        {upcoming.map(a => {
          const Icon = a.type === 'call' ? Phone : Users;
          const overdue = new Date(a.starts_at).getTime() < Date.now();
          return (
            <div key={a.id} className="rounded-lg border p-2.5">
              <p className={`text-xs ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{fmtWhen(a.starts_at)} · {a.duration_min} min</p>
              <p className="text-sm font-medium flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{a.title}</p>
              {a.location && <p className="text-xs text-muted-foreground truncate">{a.location}</p>}
              <AppointmentActions appt={a} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
