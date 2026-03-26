import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';

interface ChartEntry {
  name: string;
  value: number;
  deals: number;
}

interface Props {
  from: Date;
  to: Date;
  seId?: string;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 70%, 50%)',
  'hsl(170, 60%, 45%)',
  'hsl(280, 55%, 50%)',
  'hsl(340, 60%, 50%)',
  'hsl(40, 70%, 50%)',
];

export default function DealValueChart({ from, to }: Props) {
  const [data, setData] = useState<ChartEntry[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDealData = async () => {
      setLoading(true);
      try {
        const [assignmentsRes, sesRes] = await Promise.all([
          supabase.from('pipedrive_lead_assignments').select('sales_executive_id, org_name'),
          supabase.from('sales_executives').select('id, full_name'),
        ]);

        const assignments = assignmentsRes.data || [];
        const ses = sesRes.data || [];
        const seMap = Object.fromEntries(ses.map(se => [se.id, se.full_name || 'Onbekend']));

        const orgNameToSeName: Record<string, string> = {};
        assignments.forEach(a => {
          if (a.org_name) {
            orgNameToSeName[a.org_name.toLowerCase()] = seMap[a.sales_executive_id] || 'Onbekend';
          }
        });

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-deals`,
          {
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        const result = await res.json();
        if (result.error) throw new Error(result.error);

        const seValues: Record<string, { value: number; deals: number }> = {};
        const fromTs = from.getTime();
        const toTs = to.getTime();

        for (const stage of result.stages || []) {
          for (const deal of stage.deals || []) {
            // Filter by date range using add_time
            if (deal.add_time) {
              const dealTime = new Date(deal.add_time).getTime();
              if (dealTime < fromTs || dealTime > toTs) continue;
            }

            const seName = deal.org_name
              ? orgNameToSeName[deal.org_name.toLowerCase()] || 'Niet toegewezen'
              : 'Niet toegewezen';

            if (!seValues[seName]) seValues[seName] = { value: 0, deals: 0 };
            seValues[seName].value += deal.value || 0;
            seValues[seName].deals += 1;
          }
        }

        const chartData = Object.entries(seValues)
          .map(([name, { value, deals }]) => ({ name, value, deals }))
          .sort((a, b) => b.value - a.value);

        setData(chartData);
        setTotalValue(chartData.reduce((sum, d) => sum + d.value, 0));
      } catch (err: any) {
        console.error('Failed to load deal chart data:', err);
        setError(err.message || 'Fout bij laden');
      } finally {
        setLoading(false);
      }
    };

    fetchDealData();
  }, [from, to]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Dealwaarde per Sales Executive</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[250px]"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Dealwaarde per Sales Executive</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Dealwaarde per SE
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            Totaal: €{totalValue.toLocaleString('nl-NL')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            Geen deals in deze periode
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} angle={-25} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }}
                formatter={(value: number, _name: string, props: any) => [
                  `€${value.toLocaleString('nl-NL')} (${props.payload.deals} deal${props.payload.deals !== 1 ? 's' : ''})`,
                  'Waarde',
                ]}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
