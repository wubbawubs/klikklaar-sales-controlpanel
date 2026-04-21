import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { subWeeks } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhoneCall, Phone } from 'lucide-react';

import SETaskChecklist from '@/components/dashboard/SETaskChecklist';
import SETrainingAdviceCard from '@/components/dashboard/SETrainingAdviceCard';
import SEPerformanceBars from '@/components/dashboard/SEPerformanceBars';
import DashboardDateFilter from '@/components/dashboard/DashboardDateFilter';
import DealValueChart from '@/components/dashboard/DealValueChart';
import WeeklyActivitiesChart from '@/components/dashboard/WeeklyActivitiesChart';
import PipedriveDashboardWidget from '@/components/dashboard/PipedriveDashboardWidget';
import SEEndOfDayCTA from '@/components/dashboard/SEEndOfDayCTA';
import SEEodHistory from '@/components/dashboard/SEEodHistory';
import CICoachingCard from '@/components/dashboard/CICoachingCard';
import CIChatCard from '@/components/dashboard/CIChatCard';
import QuickActionTiles from '@/components/dashboard/QuickActionTiles';

export default function SEPersonalDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seName, setSeName] = useState('');
  const [seId, setSeId] = useState<string | null>(null);
  const [seEmail, setSeEmail] = useState('');
  const [isEmployee, setIsEmployee] = useState(false);
  const [hasLeads, setHasLeads] = useState(true);
  const [callsToday, setCallsToday] = useState(0);
  const [chartRange, setChartRange] = useState({ from: subWeeks(new Date(), 8), to: new Date() });
  const signalFired = useRef(false);

  useEffect(() => {
    if (!user) return;
    const fetchSE = async () => {
      const normalizedEmail = (user.email ?? '').trim().toLowerCase();
      const { data: seData } = await supabase
        .from('sales_executives')
        .select('id, full_name, first_name, last_name, employment_type, email')
        .or(`email.ilike.${normalizedEmail},user_id.eq.${user.id}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!seData) { setLoading(false); return; }
      setSeId(seData.id);
      setSeName(seData.full_name || `${seData.first_name} ${seData.last_name}`);
      setSeEmail(seData.email);
      setIsEmployee((seData as any).employment_type === 'employee');

      const { count } = await supabase
        .from('pipedrive_lead_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('sales_executive_id', seData.id)
        .in('status', ['assigned', 'in_progress']);
      setHasLeads((count ?? 0) > 0);

      if (!signalFired.current) {
        signalFired.current = true;
        supabase.functions.invoke('signal-engine', {
          body: { sales_executive_id: seData.id },
        }).catch(() => {});
      }

      setLoading(false);
    };
    fetchSE();
  }, [user]);

  // Live calls-today counter for header
  useEffect(() => {
    if (!seId) return;
    const fetchCalls = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('sales_executive_id', seId)
        .gte('created_at', `${today}T00:00:00`);
      setCallsToday(count ?? 0);
    };
    fetchCalls();
    const i = setInterval(fetchCalls, 60_000);
    return () => clearInterval(i);
  }, [seId]);

  // 10-minute Pipedrive sync interval for employees
  useEffect(() => {
    if (!seId || !isEmployee) return;
    supabase.functions.invoke('pipedrive-sync', {
      body: { sales_executive_id: seId },
    }).catch(() => {});
    const interval = setInterval(() => {
      supabase.functions.invoke('pipedrive-sync', {
        body: { sales_executive_id: seId },
      }).catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [seId, isEmployee]);

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

  const firstName = seName.split(' ')[0];
  const callTarget = 20;

  return (
    <div className="space-y-6 pb-32">
      {/* Compact action-first header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Welkom, {firstName}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Vandaag: <span className="font-semibold text-foreground tabular-nums">{callsToday}/{callTarget}</span> calls
            </p>
          </div>
          <Button asChild size="lg" className="gap-2 shrink-0">
            <Link to="/calls">
              <PhoneCall className="h-4 w-4" />
              Start belsessie
            </Link>
          </Button>
        </div>
      </div>

      {/* NU DOEN — 3 actie-tegels */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Nu doen</h2>
        <QuickActionTiles seId={seId} />
      </section>

      {/* JOUW LIJSTJE — takenlijst (hart van de pagina) */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Jouw lijstje vandaag</h2>
        <SETaskChecklist seId={seId} />
      </section>

      {/* VOORTGANG — compacte bars met Vandaag/Week toggle */}
      <SEPerformanceBars seId={seId} />

      {/* Secundaire info in tabs */}
      <Tabs defaultValue="tips" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="tips">Tips</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="eod">EOD historie</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="tips" className="mt-4 space-y-4">
          <CICoachingCard seId={seId} hasLeads={hasLeads} />
        </TabsContent>

        <TabsContent value="training" className="mt-4 space-y-4">
          <SETrainingAdviceCard seId={seId} seName={seName} />
        </TabsContent>

        <TabsContent value="eod" className="mt-4 space-y-4">
          <SEEodHistory seName={seName} />
        </TabsContent>

        <TabsContent value="charts" className="mt-4 space-y-4">
          {isEmployee && <PipedriveDashboardWidget seId={seId} seEmail={seEmail} />}
          <DashboardDateFilter from={chartRange.from} to={chartRange.to} onChange={setChartRange} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DealValueChart from={chartRange.from} to={chartRange.to} seId={seId} />
            <WeeklyActivitiesChart from={chartRange.from} to={chartRange.to} seId={seId} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Sticky EOD bar — alleen vanaf 16:00, dismissable */}
      <SEEndOfDayCTA seId={seId} seName={seName} />

      {/* Floating chat */}
      <CIChatCard seId={seId} seName={seName} />
    </div>
  );
}
