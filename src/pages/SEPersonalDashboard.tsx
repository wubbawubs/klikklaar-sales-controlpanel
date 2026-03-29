import { useEffect, useState } from 'react';
import { subWeeks } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import SETaskChecklist from '@/components/dashboard/SETaskChecklist';
import SETrainingAdviceCard from '@/components/dashboard/SETrainingAdviceCard';
import SEPerformanceBars from '@/components/dashboard/SEPerformanceBars';
import DashboardDateFilter from '@/components/dashboard/DashboardDateFilter';
import DealValueChart from '@/components/dashboard/DealValueChart';
import WeeklyActivitiesChart from '@/components/dashboard/WeeklyActivitiesChart';

export default function SEPersonalDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seName, setSeName] = useState('');
  const [seId, setSeId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState({ from: subWeeks(new Date(), 8), to: new Date() });

  useEffect(() => {
    if (!user) return;
    const fetchSE = async () => {
      const normalizedEmail = (user.email ?? '').trim().toLowerCase();
      const { data: seData } = await supabase
        .from('sales_executives')
        .select('id, full_name, first_name, last_name')
        .or(`email.ilike.${normalizedEmail},user_id.eq.${user.id}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!seData) { setLoading(false); return; }
      setSeId(seData.id);
      setSeName(seData.full_name || `${seData.first_name} ${seData.last_name}`);

      // Trigger signal engine (fire-and-forget)
      supabase.functions.invoke('signal-engine', {
        body: { sales_executive_id: seData.id },
      }).catch(() => {});

      setLoading(false);
    };
    fetchSE();
  }, [user]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welkom, {seName.split(' ')[0]}</h1>
        <p className="text-muted-foreground text-sm mt-1">Dit is jouw overzicht voor vandaag</p>
      </div>

      {/* 1. Performance bars — altijd zichtbaar, bescheiden */}
      <SEPerformanceBars seId={seId} />

      {/* 2. Taken checklist — wat moet je doen */}
      <SETaskChecklist seId={seId} />

      {/* 3. Training & Advies — opt-in */}
      <SETrainingAdviceCard seId={seId} seName={seName} />

      {/* 4. Charts — op verzoek, met datumfilter */}
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
