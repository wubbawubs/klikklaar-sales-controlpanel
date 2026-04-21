import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface Props {
  seId: string;
}

interface Metric {
  label: string;
  value: number;
  target: number;
  color: string;
}

export default function SEPerformanceBars({ seId }: Props) {
  const [todayMetrics, setTodayMetrics] = useState<Metric[]>([]);
  const [weekMetrics, setWeekMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'today' | 'week'>('today');

  const fetchMetrics = async () => {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [todayRes, weekRes] = await Promise.all([
      supabase
        .from('calls')
        .select('id, outcome')
        .eq('sales_executive_id', seId)
        .gte('created_at', `${today}T00:00:00`),
      supabase
        .from('calls')
        .select('id, outcome')
        .eq('sales_executive_id', seId)
        .gte('created_at', weekAgo),
    ]);

    const todayCalls = todayRes.data || [];
    const weekCalls = weekRes.data || [];

    const todayReached = todayCalls.filter(c => c.outcome !== 'not_reached').length;
    const todayInterest = todayCalls.filter(c => ['interest', 'appointment', 'deal'].includes(c.outcome)).length;

    const weekReached = weekCalls.filter(c => c.outcome !== 'not_reached').length;
    const weekInterest = weekCalls.filter(c => ['interest', 'appointment', 'deal'].includes(c.outcome)).length;
    const weekAppointments = weekCalls.filter(c => c.outcome === 'appointment').length;

    setTodayMetrics([
      { label: 'Calls', value: todayCalls.length, target: 20, color: 'bg-primary' },
      { label: 'Bereikt', value: todayReached, target: 10, color: 'bg-primary' },
      { label: 'Positief', value: todayInterest, target: 3, color: 'bg-success' },
    ]);

    setWeekMetrics([
      { label: 'Calls', value: weekCalls.length, target: 100, color: 'bg-primary' },
      { label: 'Bereikt', value: weekReached, target: 50, color: 'bg-primary' },
      { label: 'Positief', value: weekInterest, target: 15, color: 'bg-success' },
      { label: 'Afspraken', value: weekAppointments, target: 5, color: 'bg-success' },
    ]);

    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 120_000);
    return () => clearInterval(interval);
  }, [seId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchMetrics();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [seId]);

  if (loading) return null;

  const metrics = view === 'today' ? todayMetrics : weekMetrics;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Voortgang
          </h3>
          <Tabs value={view} onValueChange={v => setView(v as 'today' | 'week')}>
            <TabsList className="h-8">
              <TabsTrigger value="today" className="text-xs px-3 py-1">Vandaag</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 py-1">Week</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className={cn('grid gap-5', metrics.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
          {metrics.map(metric => {
            const pct = Math.min(100, Math.round((metric.value / metric.target) * 100));
            return (
              <div key={metric.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">{metric.label}</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {metric.value}<span className="text-muted-foreground font-normal">/{metric.target}</span>
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700 ease-out', metric.color)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
