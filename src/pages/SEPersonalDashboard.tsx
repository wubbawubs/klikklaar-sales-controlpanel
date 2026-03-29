import { useEffect, useState } from 'react';
import { subWeeks } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Target, PhoneCall, Handshake, Trophy, CreditCard, ClipboardCheck, Briefcase,
  Phone, PhoneOff, PhoneForwarded, Calendar, TrendingUp, CheckCircle2,
} from 'lucide-react';
import DashboardDateFilter from '@/components/dashboard/DashboardDateFilter';
import DealValueChart from '@/components/dashboard/DealValueChart';
import WeeklyActivitiesChart from '@/components/dashboard/WeeklyActivitiesChart';
import NextBestAction from '@/components/dashboard/NextBestAction';
import { cn } from '@/lib/utils';

export default function SEPersonalDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [seName, setSeName] = useState('');
  const [seId, setSeId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState({ from: subWeeks(new Date(), 8), to: new Date() });
  const [stats, setStats] = useState({
    openLeads: 0, callbacksToday: 0, openDeals: 0, wonDeals: 0,
    activeSubscriptions: 0, eodSubmitted: 0, totalActivities: 0,
  });
  const [callFunnel, setCallFunnel] = useState({
    total: 0, not_reached: 0, callback: 0, no_interest: 0, interest: 0, appointment: 0, deal: 0,
  });
  const [signals, setSignals] = useState<any[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const normalizedEmail = (user.email ?? '').trim().toLowerCase();

      const { data: seData } = await supabase
        .from('sales_executives')
        .select('*')
        .or(`email.ilike.${normalizedEmail},user_id.eq.${user.id}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!seData) { setLoading(false); return; }

      setSeId(seData.id);
      setSeName(seData.full_name || `${seData.first_name} ${seData.last_name}`);

      // Trigger signal engine for this SE (fire-and-forget)
      supabase.functions.invoke('signal-engine', {
        body: { sales_executive_id: seData.id },
      }).catch(() => {});

      const today = new Date().toISOString().split('T')[0];

      const [leads, activities, eods, todayCalls, signalsRes] = await Promise.all([
        supabase.from('pipedrive_lead_assignments').select('*').eq('sales_executive_id', seData.id),
        supabase.from('pipedrive_activities').select('*').eq('sales_executive_id', seData.id),
        supabase.from('eod_submissions').select('*').eq('sales_executive_id', seData.id),
        supabase.from('calls').select('*').eq('sales_executive_id', seData.id).gte('created_at', `${today}T00:00:00`),
        supabase.from('signals').select('*').eq('sales_executive_id', seData.id).eq('resolved', false).order('created_at', { ascending: false }).limit(5),
      ]);

      const leadList = leads.data || [];
      const actList = activities.data || [];
      const eodList = eods.data || [];
      const callList = todayCalls.data || [];

      setStats({
        openLeads: leadList.filter(l => l.status === 'assigned' || l.status === 'in_progress').length,
        callbacksToday: actList.filter(a => a.activity_type === 'callback' && a.due_date === today && !a.done).length,
        openDeals: leadList.filter(l => l.pipedrive_deal_id && l.status !== 'won' && l.status !== 'lost').length,
        wonDeals: leadList.filter(l => l.status === 'won').length,
        activeSubscriptions: leadList.filter(l => l.status === 'active_subscription').length,
        eodSubmitted: eodList.filter(e => e.status !== 'pending').length,
        totalActivities: actList.length,
      });

      setCallFunnel({
        total: callList.length,
        not_reached: callList.filter(c => c.outcome === 'not_reached').length,
        callback: callList.filter(c => c.outcome === 'callback').length,
        no_interest: callList.filter(c => c.outcome === 'no_interest').length,
        interest: callList.filter(c => c.outcome === 'interest').length,
        appointment: callList.filter(c => c.outcome === 'appointment').length,
        deal: callList.filter(c => c.outcome === 'deal').length,
      });

      setSignals(signalsRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const handleResolve = async (signalId: string) => {
    setResolvingId(signalId);
    const { error } = await supabase
      .from('signals')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', signalId);
    if (error) {
      toast({ title: 'Fout', description: 'Kon signaal niet oplossen.', variant: 'destructive' });
    } else {
      setSignals(prev => prev.filter(s => s.id !== signalId));
      toast({ title: 'Opgelost', description: 'Signaal is als afgehandeld gemarkeerd.' });
    }
    setResolvingId(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  if (!seId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Er is geen Sales Executive-profiel gekoppeld aan je account.</p>
      </div>
    );
  }

  const reached = callFunnel.total - callFunnel.not_reached;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welkom, {seName}</h1>
        <p className="text-muted-foreground text-sm mt-1">Jouw persoonlijke dashboard</p>
      </div>

      {/* Next Best Action */}
      <NextBestAction seId={seId} />

      {/* Reality Dashboard - Call Funnel */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Vandaag — Call Funnel</h2>
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          {[
            { label: 'Calls', value: callFunnel.total, icon: Phone, color: 'text-primary' },
            { label: 'Bereikt', value: reached, icon: PhoneCall, color: 'text-primary' },
            { label: 'Niet bereikt', value: callFunnel.not_reached, icon: PhoneOff, color: 'text-muted-foreground' },
            { label: 'Callback', value: callFunnel.callback, icon: PhoneForwarded, color: 'text-warning' },
            { label: 'Interesse', value: callFunnel.interest, icon: TrendingUp, color: 'text-accent-foreground' },
            { label: 'Afspraken', value: callFunnel.appointment, icon: Calendar, color: 'text-success' },
            { label: 'Deals', value: callFunnel.deal, icon: Handshake, color: 'text-success' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="text-center">
                <CardContent className="p-3">
                  <Icon className={cn('h-4 w-4 mx-auto mb-1', s.color)} />
                  <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Signals / Next Best Action */}
      {signals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Acties & Signalen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {signals.map(sig => (
              <div key={sig.id} className={cn(
                'p-3 rounded-lg border text-sm',
                sig.severity === 'critical' ? 'bg-destructive/5 border-destructive/20' :
                sig.severity === 'warning' ? 'bg-warning/5 border-warning/20' :
                'bg-muted/30 border-border'
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{sig.title}</p>
                    {sig.description && <p className="text-muted-foreground text-xs mt-1">{sig.description}</p>}
                    {sig.action && <p className="text-primary text-xs mt-1 font-medium">→ {sig.action}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-success"
                      onClick={() => handleResolve(sig.id)}
                      disabled={resolvingId === sig.id}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Oplossen
                    </Button>
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded uppercase',
                      sig.confidence === 'high' ? 'bg-success/10 text-success' :
                      sig.confidence === 'medium' ? 'bg-warning/10 text-warning' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {sig.confidence}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Open leads" value={stats.openLeads} icon={Target} to="/leads" />
        <StatCard title="Callbacks vandaag" value={stats.callbacksToday} icon={PhoneCall} variant="warning" to="/leads" />
        <StatCard title="Open deals" value={stats.openDeals} icon={Handshake} to="/leads" />
        <StatCard title="Gewonnen deals" value={stats.wonDeals} icon={Trophy} variant="success" to="/leads" />
        <StatCard title="Actieve abonnementen" value={stats.activeSubscriptions} icon={CreditCard} variant="info" to="/leads" />
        <StatCard title="EOD's ingediend" value={stats.eodSubmitted} icon={ClipboardCheck} variant="success" to="/eod" />
        <StatCard title="Totaal activiteiten" value={stats.totalActivities} icon={Briefcase} to="/leads" />
      </div>

      <div className="space-y-4">
        <DashboardDateFilter from={chartRange.from} to={chartRange.to} onChange={setChartRange} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DealValueChart from={chartRange.from} to={chartRange.to} seId={seId} />
          <WeeklyActivitiesChart from={chartRange.from} to={chartRange.to} seId={seId} />
        </div>
      </div>
    </div>
  );
}
