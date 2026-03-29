import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BarChart3 } from 'lucide-react';
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

  useEffect(() => {
    const fetch = async () => {
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

      // Daily targets (reasonable defaults)
      setTodayMetrics([
        { label: 'Calls', value: todayCalls.length, target: 20, color: 'bg-primary' },
        { label: 'Bereikt', value: todayReached, target: 10, color: 'bg-primary' },
        { label: 'Positief', value: todayInterest, target: 3, color: 'bg-success' },
      ]);

      // Weekly targets
      setWeekMetrics([
        { label: 'Calls', value: weekCalls.length, target: 100, color: 'bg-primary' },
        { label: 'Bereikt', value: weekReached, target: 50, color: 'bg-primary' },
        { label: 'Positief', value: weekInterest, target: 15, color: 'bg-success' },
        { label: 'Afspraken', value: weekAppointments, target: 5, color: 'bg-success' },
      ]);

      setLoading(false);
    };
    fetch();
  }, [seId]);

  if (loading) return null;

  const MetricRow = ({ metric }: { metric: Metric }) => {
    const pct = Math.min(100, Math.round((metric.value / metric.target) * 100));
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{metric.label}</span>
          <span className="font-medium text-foreground tabular-nums">{metric.value}<span className="text-muted-foreground font-normal">/{metric.target}</span></span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', metric.color)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Vandaag
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {todayMetrics.map(m => <MetricRow key={m.label} metric={m} />)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Deze week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {weekMetrics.map(m => <MetricRow key={m.label} metric={m} />)}
        </CardContent>
      </Card>
    </div>
  );
}
