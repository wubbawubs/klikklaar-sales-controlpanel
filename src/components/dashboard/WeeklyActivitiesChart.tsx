import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, PhoneCall } from 'lucide-react';
import { startOfWeek, format, eachWeekOfInterval, parseISO, isWithinInterval } from 'date-fns';
import { nl } from 'date-fns/locale';

const SE_COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 70%, 50%)',
  'hsl(170, 60%, 45%)',
  'hsl(280, 55%, 50%)',
  'hsl(340, 60%, 50%)',
  'hsl(40, 70%, 50%)',
];

interface Props {
  from: Date;
  to: Date;
  seId?: string;
}

export default function WeeklyActivitiesChart({ from, to, seId }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [seNames, setSeNames] = useState<string[]>([]);
  const [totalActivities, setTotalActivities] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch_ = async () => {
      setLoading(true);
      try {
        const [activitiesRes, sesRes] = await Promise.all([
          supabase.from('pipedrive_activities').select('sales_executive_id, created_at'),
          supabase.from('sales_executives').select('id, full_name'),
        ]);

        const activities = activitiesRes.data || [];
        const ses = sesRes.data || [];
        const seMap = Object.fromEntries(ses.map(s => [s.id, s.full_name || 'Onbekend']));

        // Build weeks within the range
        const weekStarts = eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 });
        const weeks: Record<string, Record<string, number>> = {};
        for (const ws of weekStarts) {
          weeks[format(ws, 'yyyy-MM-dd')] = {};
        }

        const weekKeys = Object.keys(weeks);
        const uniqueSEs = new Set<string>();
        let count = 0;

        for (const act of activities) {
          const created = parseISO(act.created_at || '');
          if (!isWithinInterval(created, { start: from, end: to })) continue;
          const weekStart = format(startOfWeek(created, { weekStartsOn: 1 }), 'yyyy-MM-dd');
          if (!weeks[weekStart]) continue;
          const name = seMap[act.sales_executive_id] || 'Onbekend';
          uniqueSEs.add(name);
          weeks[weekStart][name] = (weeks[weekStart][name] || 0) + 1;
          count++;
        }

        const names = Array.from(uniqueSEs).sort();
        setSeNames(names);

        const chartData = weekKeys.map(key => {
          const d = parseISO(key);
          const label = `Wk ${format(d, 'w', { locale: nl })}`;
          const entry: any = { week: label };
          names.forEach(n => { entry[n] = weeks[key][n] || 0; });
          return entry;
        });

        setData(chartData);
        setTotalActivities(count);
      } catch (err: any) {
        setError(err.message || 'Fout bij laden');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [from, to]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><PhoneCall className="h-4 w-4" />Activiteiten per week</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[250px]"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><PhoneCall className="h-4 w-4" />Activiteiten per week</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            Activiteiten per week per SE
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            Totaal: {totalActivities}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            Geen activiteiten in deze periode
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="week" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {seNames.map((name, i) => (
                <Bar key={name} dataKey={name} stackId="a" fill={SE_COLORS[i % SE_COLORS.length]} radius={i === seNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
