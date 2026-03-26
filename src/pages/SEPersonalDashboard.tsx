import { useEffect, useState } from 'react';
import { subWeeks } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/ui/stat-card';
import {
  Target, PhoneCall, Handshake, Trophy, CreditCard, ClipboardCheck, Briefcase,
} from 'lucide-react';
import DashboardDateFilter from '@/components/dashboard/DashboardDateFilter';
import DealValueChart from '@/components/dashboard/DealValueChart';
import WeeklyActivitiesChart from '@/components/dashboard/WeeklyActivitiesChart';

export default function SEPersonalDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [seName, setSeName] = useState('');
  const [seId, setSeId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState({ from: subWeeks(new Date(), 8), to: new Date() });
  const [stats, setStats] = useState({
    openLeads: 0,
    callbacksToday: 0,
    openDeals: 0,
    wonDeals: 0,
    activeSubscriptions: 0,
    eodSubmitted: 0,
    totalActivities: 0,
  });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Find the SE record linked to this user's email
      const { data: seData } = await supabase
        .from('sales_executives')
        .select('*')
        .eq('email', user.email ?? '')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!seData) {
        setLoading(false);
        return;
      }

      setSeId(seData.id);
      setSeName(seData.full_name || `${seData.first_name} ${seData.last_name}`);

      const today = new Date().toISOString().split('T')[0];

      // Fetch personal data in parallel
      const [leads, activities, eods] = await Promise.all([
        supabase.from('pipedrive_lead_assignments').select('*').eq('sales_executive_id', seData.id),
        supabase.from('pipedrive_activities').select('*').eq('sales_executive_id', seData.id),
        supabase.from('eod_submissions').select('*').eq('sales_executive_id', seData.id),
      ]);

      const leadList = leads.data || [];
      const actList = activities.data || [];
      const eodList = eods.data || [];

      const callbacksToday = actList.filter(
        a => a.activity_type === 'callback' && a.due_date === today && !a.done
      ).length;

      setStats({
        openLeads: leadList.filter(l => l.status === 'assigned' || l.status === 'in_progress').length,
        callbacksToday,
        openDeals: leadList.filter(l => l.pipedrive_deal_id && l.status !== 'won' && l.status !== 'lost').length,
        wonDeals: leadList.filter(l => l.status === 'won').length,
        activeSubscriptions: leadList.filter(l => l.status === 'active_subscription').length,
        eodSubmitted: eodList.filter(e => e.status !== 'pending').length,
        totalActivities: actList.length,
      });

      setLoading(false);
    };
    fetch();
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welkom, {seName}</h1>
        <p className="text-muted-foreground text-sm mt-1">Jouw persoonlijke dashboard</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Open leads" value={stats.openLeads} icon={Target} />
        <StatCard title="Callbacks vandaag" value={stats.callbacksToday} icon={PhoneCall} variant="warning" />
        <StatCard title="Open deals" value={stats.openDeals} icon={Handshake} />
        <StatCard title="Gewonnen deals" value={stats.wonDeals} icon={Trophy} variant="success" />
        <StatCard title="Actieve abonnementen" value={stats.activeSubscriptions} icon={CreditCard} variant="info" />
        <StatCard title="EOD's ingediend" value={stats.eodSubmitted} icon={ClipboardCheck} variant="success" />
        <StatCard title="Totaal activiteiten" value={stats.totalActivities} icon={Briefcase} />
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
