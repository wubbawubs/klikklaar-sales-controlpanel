import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Phone, Calendar, Star, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyActivityBarProps {
  seId: string;
  refreshKey?: number; // bump to force refresh
}

interface Stat {
  label: string;
  icon: any;
  value: number;
  target: number;
  color: string;
}

const DEFAULT_TARGETS = {
  calls: 50,
  callbacks: 5,
  appointments: 2,
  deals: 1,
};

export function DailyActivityBar({ seId, refreshKey = 0 }: DailyActivityBarProps) {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seId) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const load = async () => {
      const [callsRes, baselinesRes] = await Promise.all([
        supabase
          .from('calls')
          .select('outcome')
          .eq('sales_executive_id', seId)
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('se_baselines')
          .select('metric_name, baseline_value')
          .eq('sales_executive_id', seId),
      ]);

      const calls = callsRes.data || [];
      const baselines = Object.fromEntries(
        (baselinesRes.data || []).map(b => [b.metric_name, Number(b.baseline_value)])
      );

      const callsCount = calls.length;
      const callbacksCount = calls.filter(c => c.outcome === 'callback').length;
      const appointmentsCount = calls.filter(c => c.outcome === 'appointment').length;
      const dealsCount = calls.filter(c => c.outcome === 'deal').length;

      setStats([
        {
          label: 'Calls',
          icon: Phone,
          value: callsCount,
          target: baselines.calls_per_day || baselines.calls || DEFAULT_TARGETS.calls,
          color: 'text-blue-400',
        },
        {
          label: 'Callbacks',
          icon: Calendar,
          value: callbacksCount,
          target: baselines.callbacks_per_day || DEFAULT_TARGETS.callbacks,
          color: 'text-orange-400',
        },
        {
          label: 'Afspraken',
          icon: Star,
          value: appointmentsCount,
          target: baselines.appointments_per_day || DEFAULT_TARGETS.appointments,
          color: 'text-emerald-400',
        },
        {
          label: 'Deals',
          icon: Trophy,
          value: dealsCount,
          target: baselines.deals_per_day || DEFAULT_TARGETS.deals,
          color: 'text-primary',
        },
      ]);
      setLoading(false);
    };

    load();
  }, [seId, refreshKey]);

  if (loading) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map(stat => {
            const pct = Math.min(100, Math.round((stat.value / Math.max(1, stat.target)) * 100));
            const reached = stat.value >= stat.target;
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn('h-3.5 w-3.5', stat.color)} />
                    <span className="text-xs font-medium text-foreground">{stat.label}</span>
                  </div>
                  <span className={cn('text-xs font-mono', reached ? 'text-emerald-400 font-semibold' : 'text-muted-foreground')}>
                    {stat.value}/{stat.target}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn('h-1.5', reached && '[&>div]:bg-emerald-500')}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
