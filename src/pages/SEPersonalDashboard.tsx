import { useEffect, useState, useRef } from 'react';
import { subWeeks } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

export default function SEPersonalDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seName, setSeName] = useState('');
  const [seId, setSeId] = useState<string | null>(null);
  const [seEmail, setSeEmail] = useState('');
  const [isEmployee, setIsEmployee] = useState(false);
  const [hasLeads, setHasLeads] = useState(true);
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

      // Check leads count (fast, head-only)
      const { count } = await supabase
        .from('pipedrive_lead_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('sales_executive_id', seData.id)
        .in('status', ['assigned', 'in_progress']);
      setHasLeads((count ?? 0) > 0);

      // Fire signal engine only once (prevent StrictMode double-fire)
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

  // 10-minute Pipedrive sync interval for employees
  useEffect(() => {
    if (!seId || !isEmployee) return;
    // Initial sync
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

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-6">
        <div>
          <h1 className="text-page text-foreground">Welkom, {firstName}</h1>
          <p className="text-muted-foreground text-sm mt-1">Dit is jouw overzicht voor vandaag</p>
        </div>
      </div>

      {/* 1. Performance bars */}
      <SEPerformanceBars seId={seId} />

      {/* 2. Pipedrive widget (only for employees) — pass email to avoid re-query */}
      {isEmployee && <PipedriveDashboardWidget seId={seId} seEmail={seEmail} />}

      {/* Persoonlijke tips — with hasLeads prop */}
      <CICoachingCard seId={seId} hasLeads={hasLeads} />

      {/* EOD afsluiten */}
      <SEEndOfDayCTA seId={seId} seName={seName} />

      {/* Taken checklist */}
      <SETaskChecklist seId={seId} />

      {/* EOD Historie */}
      <SEEodHistory seName={seName} />

      {/* Training & Advies */}
      <SETrainingAdviceCard seId={seId} seName={seName} />

      {/* Charts */}
      <div className="space-y-4">
        <DashboardDateFilter from={chartRange.from} to={chartRange.to} onChange={setChartRange} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DealValueChart from={chartRange.from} to={chartRange.to} seId={seId} />
          <WeeklyActivitiesChart from={chartRange.from} to={chartRange.to} seId={seId} />
        </div>
      </div>

      {/* Assistent Chat (floating) */}
      <CIChatCard seId={seId} seName={seName} />
    </div>
  );
}
