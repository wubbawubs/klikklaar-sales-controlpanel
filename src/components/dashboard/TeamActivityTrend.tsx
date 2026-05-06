import { useEffect, useState } from 'react';
import { fetchAll } from '@/lib/fetch-all';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { eachDayOfInterval, format, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Props {
  from: Date;
  to: Date;
}

export default function TeamActivityTrend({ from, to }: Props) {
  const [data, setData] = useState<any[] | null>(null);
  const orgId = useOrgId();

  useEffect(() => {
    const load = async () => {
      const calls = await fetchAll<any>('calls', q => {
        let qq = q.select('outcome, created_at, organization_id').gte('created_at', from.toISOString()).lte('created_at', to.toISOString());
        if (orgId) qq = qq.eq('organization_id', orgId);
        return qq;
      });

      const days = eachDayOfInterval({ start: from, end: to });
      const rows = days.map(d => {
        const start = startOfDay(d).getTime();
        const end = start + 86400000;
        const dayCalls = calls.filter(c => {
          const t = new Date(c.created_at).getTime();
          return t >= start && t < end;
        });
        const reached = dayCalls.filter(c => c.outcome && !['not_reached', 'voicemail', 'no_answer'].includes(c.outcome)).length;
        const appts = dayCalls.filter(c => c.outcome === 'appointment').length;
        return {
          date: format(d, 'd MMM', { locale: nl }),
          Calls: dayCalls.length,
          Bereikt: reached,
          Afspraken: appts,
        };
      });
      setData(rows);
    };
    load();
  }, [from, to, orgId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Team activiteit per dag
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="h-[260px] flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : data.every(d => d.Calls === 0) ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Geen activiteit in deze periode</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} iconType="line" />
              <Line type="monotone" dataKey="Calls" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Bereikt" stroke="hsl(var(--info))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Afspraken" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
