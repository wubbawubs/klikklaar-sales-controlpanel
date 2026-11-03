import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useOrgId } from '@/hooks/useOrgId';
import { useCreateMeetingImport, useMeetingImports, type ImportStatus } from '@/hooks/useMeetings';

const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = { queued: 'Bezig met analyseren', analyzing: 'Bezig met analyseren', ready: 'Klaar', failed: 'Mislukt' };

export default function MeetingsPage() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const create = useCreateMeetingImport();
  const { data: imports = [], isLoading } = useMeetingImports();

  const submit = () => create.mutate(
    { transcript: transcript.trim(), meeting_date: date, title: title.trim() || null },
    {
      onSuccess: id => navigate(`/meetings/${id}`),
      onError: e => toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'),
    },
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Meeting verwerken</h1>
        <p className="text-sm text-muted-foreground">
          Plak het transcript van de sales-meeting. De AI stelt per klant wijzigingen voor; jij bepaalt wat er in het CRM komt.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap gap-2">
          <Input type="date" className="w-44" value={date} onChange={e => setDate(e.target.value)} aria-label="Datum van de meeting" />
          <Input className="flex-1 min-w-[200px]" placeholder="Titel (optioneel), bijv. Sales-update week 45" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <Textarea className="min-h-[260px] font-mono text-xs" value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder="Plak hier het transcript van Plaud of een gespreksverslag…" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{!orgId ? 'Kies eerst één organisatie bovenin' : `${transcript.trim().split(/\s+/).filter(Boolean).length} woorden`}</span>
          <Button onClick={submit} disabled={!transcript.trim() || !date || !orgId || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Analyseren
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Eerdere meetings</h2>
        {isLoading && <p className="text-sm text-muted-foreground">Laden…</p>}
        {!isLoading && imports.length === 0 && <p className="text-sm text-muted-foreground">Nog geen meetings verwerkt.</p>}
        <div className="divide-y rounded-lg border">
          {imports.map(m => {
            const open = m.proposals.filter(p => p.status === 'open' || p.status === 'failed').length;
            const applied = m.proposals.filter(p => p.status === 'applied').length;
            return (
              <Link key={m.id} to={`/meetings/${m.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-muted/50">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.title || 'Sales-meeting'}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(`${m.meeting_date}T12:00:00`), 'EEEE d MMMM yyyy', { locale: nl })}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.status === 'ready' && <span className="text-xs text-muted-foreground">{applied} toegepast · {open} open</span>}
                  <Badge variant={m.status === 'failed' ? 'destructive' : m.status === 'ready' ? 'secondary' : 'outline'}>{IMPORT_STATUS_LABEL[m.status]}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
