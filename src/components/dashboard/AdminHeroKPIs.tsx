import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent } from '@/components/ui/card';
import { PhoneCall, MessageSquare, CalendarCheck, Trophy, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { startOfDay, subDays, format, eachDayOfInterval } from 'date-fns';

interface KPI {
  label: string;
  value: number;
  prev: number;
  spark: number[];
  icon: typeof PhoneCall;
  accent: string;
}

interface Props {
  from: Date;
  to: Date;
}

export default function AdminHeroKPIs({ from, to }: Props) {
  const [kpis, setKpis] = useState<KPI[] | null>(null);
  const orgId = useOrgId();

  useEffect(() => {
    const load = async () => {
      const periodMs = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - periodMs);
      const prevTo = from;

      const [calls, leads] = await Promise.all([
        fetchAll<any>('calls', q => {
          let qq = q.select('id, outcome, created_at, organization_id').gte('created_at', prevFrom.toISOString()).lte('created_at', to.toISOString());
          if (orgId) qq = qq.eq('organization_id', orgId);
          return qq;
        }),
        fetchAll<any>('pipedrive_lead_assignments', q => {
          let qq = q.select('id, status, updated_at, organization_id').gte('updated_at', prevFrom.toISOString()).lte('updated_at', to.toISOString());
          if (orgId) qq = qq.eq('organization_id', orgId);
          return qq;
        }),
      ]);

      const inRange = (d: string, a: Date, b: Date) => {
        const t = new Date(d).getTime();
        return t >= a.getTime() && t <= b.getTime();
      };

      const periodCalls = calls.filter(c => inRange(c.created_at, from, to));
      const prevCalls = calls.filter(c => inRange(c.created_at, prevFrom, prevTo));

      const reached = (arr: any[]) =>
        arr.filter(c => c.outcome && !['not_reached', 'voicemail', 'no_answer'].includes(c.outcome)).length;
      const appts = (arr: any[]) => arr.filter(c => c.outcome === 'appointment').length;

      const periodWon = leads.filter(l => l.status === 'won' && inRange(l.updated_at, from, to)).length;
      const prevWon = leads.filter(l => l.status === 'won' && inRange(l.updated_at, prevFrom, prevTo)).length;

      // Sparkline: last 14 days of calls
      const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
      const sparkCalls = days.map(d => {
        const start = startOfDay(d).getTime();
        const end = start + 86400000;
        return calls.filter(c => {
          const t = new Date(c.created_at).getTime();
          return t >= start && t < end;
        }).length;
      });
      const sparkReached = days.map(d => {
        const start = startOfDay(d).getTime();
        const end = start + 86400000;
        return reached(calls.filter(c => {
          const t = new Date(c.created_at).getTime();
          return t >= start && t < end;
        }));
      });
      const sparkAppts = days.map(d => {
        const start = startOfDay(d).getTime();
        const end = start + 86400000;
        return appts(calls.filter(c => {
          const t = new Date(c.created_at).getTime();
          return t >= start && t < end;
        }));
      });
      const sparkWon = days.map(d => {
        const start = startOfDay(d).getTime();
        const end = start + 86400000;
        return leads.filter(l => {
          if (l.status !== 'won') return false;
          const t = new Date(l.updated_at).getTime();
          return t >= start && t < end;
        }).length;
      });

      setKpis([
        { label: 'Calls', value: periodCalls.length, prev: prevCalls.length, spark: sparkCalls, icon: PhoneCall, accent: 'text-primary bg-primary/10' },
        { label: 'Bereikt', value: reached(periodCalls), prev: reached(prevCalls), spark: sparkReached, icon: MessageSquare, accent: 'text-info bg-info/10' },
        { label: 'Afspraken', value: appts(periodCalls), prev: appts(prevCalls), spark: sparkAppts, icon: CalendarCheck, accent: 'text-warning bg-warning/10' },
        { label: 'Deals gewonnen', value: periodWon, prev: prevWon, spark: sparkWon, icon: Trophy, accent: 'text-success bg-success/10' },
      ]);
    };
    load();
  }, [from, to]);

  if (!kpis) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <Card key={i}><CardContent className="h-[120px] flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map(k => {
        const delta = k.prev === 0 ? (k.value > 0 ? 100 : 0) : ((k.value - k.prev) / k.prev) * 100;
        const Trend = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus;
        const trendColor = delta > 1 ? 'text-success' : delta < -1 ? 'text-destructive' : 'text-muted-foreground';
        return (
          <Card key={k.label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{k.label}</p>
                  <p className="text-3xl font-bold tabular-nums text-foreground mt-1">{k.value.toLocaleString('nl-NL')}</p>
                </div>
                <div className={cn('p-2.5 rounded-xl', k.accent)}>
                  <k.icon className="h-[18px] w-[18px]" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
                  <Trend className="h-3.5 w-3.5" />
                  <span>{delta > 0 ? '+' : ''}{delta.toFixed(0)}%</span>
                  <span className="text-muted-foreground font-normal">vs vorige periode</span>
                </div>
                <Sparkline data={k.spark} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const w = 60, h = 20;
  const step = w / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="text-primary/60">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}
