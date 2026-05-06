import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface RepStats {
  se_id: string;
  se_name: string;
  status: string;
  total_leads: number;
  contacted: number;
  qualified: number;
  won: number;
  lost: number;
  total_calls: number;
  callbacks: number;
  conversion_rate: number; // won / total_leads
  contact_rate: number; // (contacted+qualified+won) / total_leads
}

export default function PerRepAnalytics() {
  const [stats, setStats] = useState<RepStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const [seList, leads, calls] = await Promise.all([
      supabase.from('sales_executives').select('id, full_name, status').eq('status', 'active').then(r => r.data || []),
      fetchAll('lead_assignments', q => q.select('sales_executive_id, status')),
      fetchAll('calls', q => q.select('sales_executive_id, outcome')),
    ]);

    const repStats: RepStats[] = seList.map(se => {
      const seLeads = leads.filter(l => l.sales_executive_id === se.id);
      const seCalls = calls.filter(c => c.sales_executive_id === se.id);
      const total = seLeads.length;
      const contacted = seLeads.filter(l => l.status === 'contacted').length;
      const qualified = seLeads.filter(l => l.status === 'qualified').length;
      const won = seLeads.filter(l => l.status === 'won').length;
      const lost = seLeads.filter(l => l.status === 'lost').length;

      return {
        se_id: se.id,
        se_name: se.full_name || 'Onbekend',
        status: se.status || 'active',
        total_leads: total,
        contacted,
        qualified,
        won,
        lost,
        total_calls: seCalls.length,
        callbacks: seCalls.filter(c => c.outcome === 'callback').length,
        conversion_rate: total > 0 ? (won / total) * 100 : 0,
        contact_rate: total > 0 ? ((contacted + qualified + won) / total) * 100 : 0,
      };
    });

    // Sort by total calls desc
    repStats.sort((a, b) => b.total_calls - a.total_calls);
    setStats(repStats);
    setLoading(false);
  };

  // Team averages
  const teamAvg = stats.length > 0 ? {
    calls: Math.round(stats.reduce((s, r) => s + r.total_calls, 0) / stats.length),
    convRate: stats.reduce((s, r) => s + r.conversion_rate, 0) / stats.length,
    contactRate: stats.reduce((s, r) => s + r.contact_rate, 0) / stats.length,
  } : { calls: 0, convRate: 0, contactRate: 0 };

  const TrendIcon = ({ value, avg }: { value: number; avg: number }) => {
    if (value > avg * 1.1) return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
    if (value < avg * 0.9) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Prestaties per Sales Executive</CardTitle>
        <p className="text-sm text-muted-foreground">
          Teamgemiddelde: {teamAvg.calls} calls · {teamAvg.convRate.toFixed(1)}% conversie · {teamAvg.contactRate.toFixed(1)}% contactratio
        </p>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {stats.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Geen actieve sales executives</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sales Executive</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Contacted</TableHead>
                <TableHead className="text-right">Qualified</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Lost</TableHead>
                <TableHead className="text-right">Contactratio</TableHead>
                <TableHead className="text-right">Conversie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map(rep => (
                <TableRow key={rep.se_id}>
                  <TableCell className="font-medium">{rep.se_name}</TableCell>
                  <TableCell className="text-right">{rep.total_leads}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {rep.total_calls}
                      <TrendIcon value={rep.total_calls} avg={teamAvg.calls} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{rep.contacted}</TableCell>
                  <TableCell className="text-right">{rep.qualified}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {rep.won}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      {rep.lost}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {rep.contact_rate.toFixed(1)}%
                      <TrendIcon value={rep.contact_rate} avg={teamAvg.contactRate} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className={rep.conversion_rate > teamAvg.convRate ? 'text-green-600 font-semibold' : ''}>
                        {rep.conversion_rate.toFixed(1)}%
                      </span>
                      <TrendIcon value={rep.conversion_rate} avg={teamAvg.convRate} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
