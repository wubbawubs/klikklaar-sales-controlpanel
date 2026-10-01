import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaveAppointment, type Appointment, type AppointmentType } from '@/hooks/useAppointments';
import { useTeamMembers } from '@/hooks/useBoards';
import { useAuth } from '@/hooks/useAuth';
import type { Deal } from '@/hooks/usePipeline';
import { format } from 'date-fns';

const DURATIONS = [15, 30, 45, 60, 90];
type DealRef = Pick<Deal, 'id' | 'title' | 'company_id' | 'contact_id' | 'company' | 'contact'>;

const defaultTitle = (type: AppointmentType, deal: DealRef | null) =>
  type === 'call' ? `Call met ${deal?.contact?.name ?? deal?.company?.name ?? deal?.title ?? ''}`.trim()
                  : `Meeting met ${deal?.company?.name ?? deal?.contact?.name ?? deal?.title ?? ''}`.trim();

function nextQuarter(): Date {
  const d = new Date(); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0); return d;
}

export function AppointmentDialog({ open, onClose, deal, type, appointment }: {
  open: boolean; onClose: () => void; deal: DealRef | null; type: AppointmentType; appointment?: Appointment | null;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        {open && <Form key={appointment?.id ?? type} onClose={onClose} deal={deal} initialType={type} appointment={appointment} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ onClose, deal, initialType, appointment }: { onClose: () => void; deal: DealRef | null; initialType: AppointmentType; appointment?: Appointment | null }) {
  const { user } = useAuth();
  const { data: team = [] } = useTeamMembers();
  const save = useSaveAppointment();
  const start = appointment ? new Date(appointment.starts_at) : nextQuarter();
  const [type, setType] = useState<AppointmentType>(appointment?.type ?? initialType);
  const [title, setTitle] = useState(appointment?.title ?? defaultTitle(initialType, deal));
  const [date, setDate] = useState(format(start, 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(start, 'HH:mm'));
  const [duration, setDuration] = useState(String(appointment?.duration_min ?? 30));
  const [location, setLocation] = useState(appointment?.location ?? '');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [ownerId, setOwnerId] = useState(appointment?.owner_id ?? user?.id ?? '');

  const startsAt = new Date(`${date}T${time}`);
  const inPast = startsAt.getTime() < Date.now();

  const submit = () => save.mutate({
    id: appointment?.id, type, title: title.trim(), starts_at: startsAt.toISOString(),
    duration_min: Number(duration), location: type === 'meeting' ? location || null : null, notes: notes || null,
    owner_id: ownerId, deal_id: appointment?.deal_id ?? deal?.id ?? null,
    company_id: appointment?.company_id ?? deal?.company_id ?? null, contact_id: appointment?.contact_id ?? deal?.contact_id ?? null,
  }, { onSuccess: onClose });

  return (
    <>
      <DialogHeader><DialogTitle>{appointment ? 'Afspraak verzetten' : type === 'call' ? 'Call plannen' : 'Meeting plannen'}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Select value={type} onValueChange={v => setType(v as AppointmentType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="call">📞 Call</SelectItem><SelectItem value="meeting">👥 Meeting</SelectItem></SelectContent>
        </Select>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel" />
        <div className="grid grid-cols-3 gap-2">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="col-span-1" />
          <Input type="time" step={900} value={time} onChange={e => setTime(e.target.value)} />
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{DURATIONS.map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {inPast && <p className="text-xs text-amber-600">Let op: dit tijdstip ligt in het verleden.</p>}
        {type === 'meeting' && <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Locatie of Teams-link" />}
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger><SelectValue placeholder="Eigenaar" /></SelectTrigger>
          <SelectContent>{team.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || m.email}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notitie (optioneel)" className="min-h-[70px]" />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Annuleren</Button>
        <Button onClick={submit} disabled={!title.trim() || !date || !time || !ownerId || isNaN(startsAt.getTime()) || save.isPending}>Opslaan</Button>
      </DialogFooter>
    </>
  );
}
