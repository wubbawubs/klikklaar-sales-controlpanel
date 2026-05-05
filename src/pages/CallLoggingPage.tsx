import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Phone, PhoneOff, PhoneForwarded, Calendar, Handshake, XCircle, Plus, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';


const OUTCOMES = [
  { value: 'not_reached', label: 'Niet bereikbaar', icon: PhoneOff, color: 'text-muted-foreground' },
  { value: 'callback', label: 'Callback', icon: PhoneForwarded, color: 'text-warning' },
  { value: 'no_interest', label: 'Geen interesse', icon: XCircle, color: 'text-destructive' },
  { value: 'interest', label: 'Interesse', icon: Phone, color: 'text-primary' },
  { value: 'appointment', label: 'Afspraak', icon: Calendar, color: 'text-success' },
  { value: 'deal', label: 'Deal', icon: Handshake, color: 'text-success' },
] as const;

type Outcome = typeof OUTCOMES[number]['value'];

export default function CallLoggingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome>('not_reached');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [orgName, setOrgName] = useState('');
  const [notes, setNotes] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [selectedLead, setSelectedLead] = useState<string>('none');

  // Prefill from URL params (e.g. from DealDetailSheet)
  useEffect(() => {
    const org = searchParams.get('org');
    const contact = searchParams.get('contact');
    const phone = searchParams.get('phone');
    const lead = searchParams.get('lead');
    if (org || contact || phone || lead) {
      if (org) setOrgName(org);
      if (contact) setContactName(contact);
      if (phone) setContactPhone(phone);
      if (lead) setSelectedLead(lead);
      setShowForm(true);
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, []);

  // Get SE id
  const { data: seData } = useQuery({
    queryKey: ['se-profile', user?.email],
    queryFn: async () => {
      // Try by email first, then by user_id (supports multiple auth accounts)
      const normalizedEmail = (user?.email ?? '').trim().toLowerCase();
      const { data } = await supabase
        .from('sales_executives')
        .select('id, full_name')
        .or(`email.ilike.${normalizedEmail},user_id.eq.${user?.id}`)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });

  // Get leads for quick-select
  const { data: leads } = useQuery({
    queryKey: ['se-leads', seData?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_assignments')
        .select('*')
        .eq('sales_executive_id', seData!.id)
        .in('status', ['assigned', 'in_progress', 'contacted']);
      return data ?? [];
    },
    enabled: !!seData?.id,
  });

  // Get today's calls
  const { data: todayCalls } = useQuery({
    queryKey: ['calls-today', seData?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('sales_executive_id', seData!.id)
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!seData?.id,
  });

  const logCall = useMutation({
    mutationFn: async () => {
      const lead = selectedLead !== 'none' ? leads?.find(l => l.id === selectedLead) : null;
      const { error } = await supabase.from('calls').insert({
        sales_executive_id: seData!.id,
        lead_assignment_id: selectedLead !== 'none' ? selectedLead : null,
        contact_name: contactName || lead?.person_name || null,
        contact_phone: contactPhone || lead?.person_phone || null,
        org_name: orgName || lead?.org_name || null,
        outcome: selectedOutcome,
        callback_date: selectedOutcome === 'callback' && callbackDate ? callbackDate : null,
        callback_time: selectedOutcome === 'callback' && callbackTime ? callbackTime : null,
        notes: notes || null,
      });
      if (error) throw error;

      // Update lead assignment status when a call is logged against it
      if (selectedLead !== 'none') {
        const newStatus = ['interest', 'appointment', 'deal'].includes(selectedOutcome)
          ? 'qualified'
          : 'contacted';
        await supabase
          .from('lead_assignments')
          .update({ status: newStatus })
          .eq('id', selectedLead)
          .eq('sales_executive_id', seData!.id);
      }
    },
    onSuccess: () => {
      toast({ title: 'Call gelogd', description: `${OUTCOMES.find(o => o.value === selectedOutcome)?.label} geregistreerd.` });
      // Invalidate all related queries so dashboard components refresh
      queryClient.invalidateQueries({ queryKey: ['calls-today'] });
      queryClient.invalidateQueries({ queryKey: ['se-leads'] });
      queryClient.invalidateQueries({ queryKey: ['se-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['se-performance'] });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: 'Fout', description: err.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setContactName('');
    setContactPhone('');
    setOrgName('');
    setNotes('');
    setCallbackDate('');
    setCallbackTime('');
    setSelectedOutcome('not_reached');
    setSelectedLead('none');
    setShowForm(false);
  };

  const handleLeadSelect = (leadId: string) => {
    setSelectedLead(leadId);
    if (leadId !== 'none') {
      const lead = leads?.find(l => l.id === leadId);
      if (lead) {
        setContactName(lead.person_name || '');
        setContactPhone(lead.person_phone || '');
        setOrgName(lead.org_name || '');
      }
    }
  };

  // Funnel stats from today's calls
  const funnel = {
    total: todayCalls?.length ?? 0,
    not_reached: todayCalls?.filter(c => c.outcome === 'not_reached').length ?? 0,
    callback: todayCalls?.filter(c => c.outcome === 'callback').length ?? 0,
    no_interest: todayCalls?.filter(c => c.outcome === 'no_interest').length ?? 0,
    interest: todayCalls?.filter(c => c.outcome === 'interest').length ?? 0,
    appointment: todayCalls?.filter(c => c.outcome === 'appointment').length ?? 0,
    deal: todayCalls?.filter(c => c.outcome === 'deal').length ?? 0,
  };

  const reached = funnel.total - funnel.not_reached;

  if (!seData) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Geen SE-profiel gekoppeld aan je account. Call logging is beschikbaar voor Sales Executives.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Call Logging</h1>
          <p className="text-muted-foreground text-sm mt-1">Registreer je belpogingen en resultaten</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nieuwe call
        </Button>
      </div>

      {/* Reality Dashboard - Today's Funnel */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
        {[
          { label: 'Calls', value: funnel.total, color: 'bg-primary/10 text-primary' },
          { label: 'Bereikt', value: reached, color: 'bg-primary/10 text-primary' },
          { label: 'Niet bereikt', value: funnel.not_reached, color: 'bg-muted text-muted-foreground' },
          { label: 'Callback', value: funnel.callback, color: 'bg-warning/10 text-warning' },
          { label: 'Interesse', value: funnel.interest, color: 'bg-accent text-accent-foreground' },
          { label: 'Afspraken', value: funnel.appointment, color: 'bg-success/10 text-success' },
          { label: 'Deals', value: funnel.deal, color: 'bg-success/10 text-success' },
        ].map(s => (
          <Card key={s.label} className="text-center">
            <CardContent className="p-3">
              <p className={cn('text-2xl font-bold', s.color.split(' ')[1])}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Log Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nieuwe call registreren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lead selector */}
            {leads && leads.length > 0 && (
              <div className="space-y-2">
                <Label>Koppel aan lead (optioneel)</Label>
                <Select value={selectedLead} onValueChange={handleLeadSelect}>
                  <SelectTrigger><SelectValue placeholder="Selecteer een lead..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Geen lead —</SelectItem>
                    {leads.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.person_name || l.org_name || 'Onbekend'} {l.org_name ? `(${l.org_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Lead info panel verwijderd met Pipedrive */}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Contactpersoon</Label>
                <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Naam" />
              </div>
              <div className="space-y-2">
                <Label>Telefoonnummer</Label>
                <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+31..." />
              </div>
              <div className="space-y-2">
                <Label>Organisatie</Label>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Bedrijfsnaam" />
              </div>
            </div>

            {/* Outcome buttons */}
            <div className="space-y-2">
              <Label>Resultaat</Label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {OUTCOMES.map(o => {
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setSelectedOutcome(o.value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm',
                        selectedOutcome === o.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/50 text-muted-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Callback fields */}
            {selectedOutcome === 'callback' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Callback datum</Label>
                  <Input type="date" value={callbackDate} onChange={e => setCallbackDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Callback tijd</Label>
                  <Input type="time" value={callbackTime} onChange={e => setCallbackTime(e.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notities (optioneel)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Korte notitie over het gesprek..." rows={2} />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>Annuleren</Button>
              <Button onClick={() => logCall.mutate()} disabled={logCall.isPending}>
                {logCall.isPending ? 'Opslaan...' : 'Call opslaan'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Call History */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Vandaag gelogde calls ({todayCalls?.length ?? 0})</CardTitle>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {!todayCalls?.length ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nog geen calls gelogd vandaag. Klik op "Nieuwe call" om te starten.</p>
            ) : (
              <div className="space-y-2">
                {todayCalls.map(call => {
                  const outcome = OUTCOMES.find(o => o.value === call.outcome);
                  const Icon = outcome?.icon ?? Phone;
                  return (
                    <div key={call.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                      <div className={cn('p-2 rounded-full bg-background', outcome?.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">
                          {call.contact_name || call.org_name || 'Onbekend contact'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {outcome?.label}
                          {call.org_name && call.contact_name ? ` · ${call.org_name}` : ''}
                          {call.callback_date ? ` · Callback: ${call.callback_date}` : ''}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(parseISO(call.created_at), 'HH:mm')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
