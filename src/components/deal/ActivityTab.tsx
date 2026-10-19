import { useState } from 'react';
import { MessageSquare, Phone, Mail, User, ChevronRight, CalendarClock, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDealActivities, useAddActivity, type Deal } from '@/hooks/usePipeline';
import { useDealAppointments, useCompanyActivities } from '@/hooks/useAppointments';
import { fmtWhen } from './AppointmentsPanel';

const ICONS: Record<string, LucideIcon> = { note: MessageSquare, call: Phone, email: Mail, meeting: User, stage_change: ChevronRight, appointment: CalendarClock };
const STATUS: Record<string, string> = { planned: 'gepland', done: 'gedaan', cancelled: 'geannuleerd', no_show: 'no-show' };

interface Entry { id: string; type: string; body: string; at: string; sub?: string }
// Shape shared by deal activities and company-wide activities (the latter carry the deal title).
interface ActivityRow { id: string; type: string; body: string | null; created_at: string; deal_id?: string; deal_title?: string }

export function ActivityTab({ deal }: { deal: Deal }) {
  const [scope, setScope] = useState<'deal' | 'company'>('deal');
  const { data: dealActs = [] } = useDealActivities(deal.id);
  const { data: companyActs = [] } = useCompanyActivities(scope === 'company' ? deal.company_id : null);
  const { data: appts = [] } = useDealAppointments(deal.id);
  const add = useAddActivity();
  const [note, setNote] = useState('');
  const [type, setType] = useState('note');

  const acts: Entry[] = ((scope === 'company' ? companyActs : dealActs) as ActivityRow[]).map(a => ({
    id: a.id, type: a.type, body: a.body ?? '', at: a.created_at,
    sub: scope === 'company' && a.deal_id !== deal.id ? a.deal_title : undefined,
  }));
  const apptEntries: Entry[] = scope === 'deal' ? appts.filter(a => a.status === 'planned' || a.status === 'cancelled').map(a => ({
    id: `appt-${a.id}`, type: 'appointment', at: a.starts_at,
    body: `${a.type === 'call' ? 'Call' : 'Meeting'} ${STATUS[a.status]}: ${a.title} (${fmtWhen(a.starts_at)})`,
  })) : [];
  const entries = [...acts, ...apptEntries].sort((x, y) => +new Date(y.at) - +new Date(x.at));

  const submit = () => {
    if (!note.trim()) return;
    // Only clear the field once the note is actually stored; on failure the text stays so it can be retried.
    add.mutate({ dealId: deal.id, type, body: note.trim() }, { onSuccess: () => setNote('') });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="note">Notitie</SelectItem><SelectItem value="call">Call</SelectItem>
            <SelectItem value="email">E-mail</SelectItem><SelectItem value="meeting">Meeting</SelectItem>
          </SelectContent>
        </Select>
        <Textarea placeholder="Voeg een notitie toe..." value={note} onChange={e => setNote(e.target.value)} className="text-sm min-h-[60px] flex-1" />
      </div>
      <Button size="sm" onClick={submit} disabled={!note.trim() || add.isPending} className="self-end">Opslaan</Button>

      {deal.company_id && (
        <ToggleGroup type="single" size="sm" value={scope} onValueChange={v => v && setScope(v as 'deal' | 'company')} className="self-start">
          <ToggleGroupItem value="deal">Deze deal</ToggleGroupItem>
          <ToggleGroupItem value="company">Hele bedrijf</ToggleGroupItem>
        </ToggleGroup>
      )}

      <div className="flex flex-col gap-2 mt-1">
        {entries.map(e => {
          const Icon = ICONS[e.type] ?? MessageSquare;
          return (
            <div key={e.id} className="flex gap-2.5 text-sm">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0"><Icon className="h-3 w-3 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-foreground/90 break-words whitespace-pre-wrap">{e.body}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(e.at).toLocaleDateString('nl', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {e.sub && ` · ${e.sub}`}
                </p>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nog geen activiteit</p>}
      </div>
    </div>
  );
}
