import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Phone, PhoneOff, PhoneForwarded, Calendar as CalendarIcon, Handshake, XCircle, Loader2, CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const OUTCOMES = [
  { value: 'not_reached', label: 'Niet bereikt', icon: PhoneOff },
  { value: 'callback', label: 'Callback', icon: PhoneForwarded },
  { value: 'no_interest', label: 'Geen interesse', icon: XCircle },
  { value: 'interest', label: 'Interesse', icon: Phone },
  { value: 'appointment', label: 'Afspraak', icon: Calendar },
  { value: 'deal', label: 'Deal', icon: Handshake },
] as const;

type Outcome = typeof OUTCOMES[number]['value'];

interface InlineCallLoggerProps {
  leadAssignmentId?: string | null;
  orgName?: string | null;
  personName?: string | null;
  personPhone?: string | null;
  onLogged?: () => void;
}

export function InlineCallLogger({ leadAssignmentId, orgName, personName, personPhone, onLogged }: InlineCallLoggerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState('');
  const [callbackDate, setCallbackDate] = useState<Date | undefined>(undefined);
  const [callbackTime, setCallbackTime] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: seData } = useQuery({
    queryKey: ['se-profile-inline', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_executives')
        .select('id')
        .or(`email.ilike.${(user?.email ?? '').trim().toLowerCase()},user_id.eq.${user?.id}`)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const logCall = useMutation({
    mutationFn: async () => {
      if (!seData?.id || !outcome) throw new Error('Geen SE profiel of resultaat geselecteerd');

      const { error } = await supabase.from('calls').insert({
        sales_executive_id: seData.id,
        lead_assignment_id: leadAssignmentId || null,
        contact_name: personName || null,
        contact_phone: personPhone || null,
        org_name: orgName || null,
        outcome,
        callback_date: outcome === 'callback' && callbackDate ? callbackDate : null,
        callback_time: outcome === 'callback' && callbackTime ? callbackTime : null,
        notes: notes || null,
      });
      if (error) throw error;

      // Update lead status
      if (leadAssignmentId) {
        const newStatus = ['interest', 'appointment', 'deal'].includes(outcome) ? 'qualified' : 'contacted';
        await supabase
          .from('pipedrive_lead_assignments')
          .update({ status: newStatus })
          .eq('id', leadAssignmentId)
          .eq('sales_executive_id', seData.id);
      }
    },
    onSuccess: () => {
      setSuccess(true);
      toast({ title: 'Call gelogd ✓', description: `${OUTCOMES.find(o => o.value === outcome)?.label} geregistreerd voor ${orgName || 'onbekend'}.` });
      queryClient.invalidateQueries({ queryKey: ['calls-today'] });
      queryClient.invalidateQueries({ queryKey: ['se-leads'] });
      queryClient.invalidateQueries({ queryKey: ['se-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['se-performance'] });
      onLogged?.();
    },
    onError: (err: any) => {
      toast({ title: 'Fout bij loggen', description: err.message, variant: 'destructive' });
    },
  });

  if (success) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-success/10 border border-success/20 text-success">
        <CheckCircle className="h-5 w-5" />
        <div>
          <p className="font-medium text-sm">Call gelogd!</p>
          <p className="text-xs opacity-80">{OUTCOMES.find(o => o.value === outcome)?.label} — {orgName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-success hover:text-success"
          onClick={() => {
            setSuccess(false);
            setOutcome(null);
            setNotes('');
            setCallbackDate('');
            setCallbackTime('');
          }}
        >
          Nog een call
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Outcome buttons - 2x3 grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {OUTCOMES.map(o => {
          const Icon = o.icon;
          const selected = outcome === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              className={cn(
                'flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-all text-xs font-medium',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 hover:border-primary/40 text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Callback date/time */}
      {outcome === 'callback' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Datum</Label>
            <Input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tijd</Label>
            <Input type="time" value={callbackTime} onChange={e => setCallbackTime(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      )}

      {/* Notes */}
      <Textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Korte notitie (optioneel)..."
        rows={2}
        className="text-sm resize-none"
      />

      {/* Submit */}
      <Button
        onClick={() => logCall.mutate()}
        disabled={!outcome || logCall.isPending || !seData?.id}
        className="w-full gap-2"
        size="sm"
      >
        {logCall.isPending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Opslaan...</>
        ) : (
          <><Phone className="h-4 w-4" /> Call loggen</>
        )}
      </Button>
    </div>
  );
}
