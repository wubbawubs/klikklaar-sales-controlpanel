import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Phone, MessageSquare, Calendar, FileText, TrendingUp, Zap, Target, AlertTriangle } from 'lucide-react';

export default function AnalyticsPage() {
  const [data, setData] = useState<any[]>([]);
  const [filters, setFilters] = useState({ team: 'all', employee: '', dateFrom: '', dateTo: '' });
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [lowScoreEmployees, setLowScoreEmployees] = useState<any[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => { loadData(); }, [filters]);

  const loadData = async () => {
    let query = (supabase as any).from('eod_submission_data').select('*').order('work_date', { ascending: true });
    if (filters.team !== 'all') query = query.eq('team', filters.team);
    if (filters.employee) query = query.ilike('employee_name', `%${filters.employee}%`);
    if (filters.dateFrom) query = query.gte('work_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('work_date', filters.dateTo);
    const { data: rows } = await query;
    const d = rows || [];
    setData(d);

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const todayData = d.filter((r: any) => r.work_date === today);
    const weekData = d.filter((r: any) => r.work_date >= weekAgo);
    const sum = (arr: any[], key: string) => arr.reduce((s, r) => s + (r[key] || 0), 0);
    const avg = (arr: any[], key: string) => arr.length ? sum(arr, key) / arr.length : 0;

    setStats({
      todayCount: todayData.length, weekCount: weekData.length,
      avgDayScore: Math.round(avg(d, 'day_score') * 10) / 10, avgEnergy: Math.round(avg(d, 'energy_score') * 10) / 10,
      totalCalls: sum(d, 'calls_attempted'), totalConversations: sum(d, 'real_conversations'),
      totalAppointments: sum(d, 'appointments_set'), totalFollowups: sum(d, 'followups_set'), totalDeals: sum(d, 'deals_closed'),
      conversionRate: sum(d, 'calls_attempted') ? Math.round(sum(d, 'real_conversations') / sum(d, 'calls_attempted') * 100) : 0,
      appointmentRate: sum(d, 'real_conversations') ? Math.round(sum(d, 'appointments_set') / sum(d, 'real_conversations') * 100) : 0,
      dealRate: sum(d, 'real_conversations') ? Math.round(sum(d, 'deals_closed') / sum(d, 'real_conversations') * 100) : 0,
    });

    const byDay: Record<string, any> = {};
    d.forEach((r: any) => {
      if (!byDay[r.work_date]) byDay[r.work_date] = { date: r.work_date, calls: 0, conversations: 0, appointments: 0, deals: 0, dayScoreSum: 0, energySum: 0, count: 0 };
      const day = byDay[r.work_date];
      day.calls += r.calls_attempted || 0; day.conversations += r.real_conversations || 0;
      day.appointments += r.appointments_set || 0; day.deals += r.deals_closed || 0;
      day.dayScoreSum += r.day_score || 0; day.energySum += r.energy_score || 0; day.count++;
    });
    setDailyData(Object.values(byDay).map((dd: any) => ({ ...dd, avgDayScore: Math.round(dd.dayScoreSum / dd.count * 10) / 10, avgEnergy: Math.round(dd.energySum / dd.count * 10) / 10 })));

    const empScores: Record<string, { total: number; count: number; energy: number }> = {};
    d.forEach((r: any) => {
      if (!r.employee_name) return;
      if (!empScores[r.employee_name]) empScores[r.employee_name] = { total: 0, count: 0, energy: 0 };
      empScores[r.employee_name].total += r.day_score || 0; empScores[r.employee_name].energy += r.energy_score || 0; empScores[r.employee_name].count++;
    });
    setLowScoreEmployees(Object.entries(empScores).map(([name, s]) => ({ name, avgDay: Math.round(s.total / s.count * 10) / 10, avgEnergy: Math.round(s.energy / s.count * 10) / 10 })).filter(e => e.avgDay <= 6 || e.avgEnergy <= 6));
    setBlockers(d.map((r: any) => r.blocker_text).filter(Boolean).slice(-10).reverse());
  };

  const Stat = ({ title, value, icon }: { title: string; value: any; icon: React.ReactNode }) => (
    <Card><CardContent className="p-4 flex items-center gap-3"><div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div><div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value}</p></div></CardContent></Card>
  );

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Analytics</h1><p className="text-muted-foreground">Inzicht in evaluatieresultaten</p></div>

      <Card><CardContent className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={filters.team} onValueChange={v => setFilters({ ...filters, team: v })}>
            <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Alle teams</SelectItem><SelectItem value="Sales Executive">Sales Executive</SelectItem><SelectItem value="Sales Support">Sales Support</SelectItem><SelectItem value="Management">Management</SelectItem></SelectContent>
          </Select>
          <Input placeholder="Medewerker..." value={filters.employee} onChange={e => setFilters({ ...filters, employee: e.target.value })} />
          <Input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
          <Input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Stat title="Vandaag" value={stats.todayCount || 0} icon={<FileText className="h-5 w-5" />} />
        <Stat title="Deze week" value={stats.weekCount || 0} icon={<Calendar className="h-5 w-5" />} />
        <Stat title="Gem. dagscore" value={stats.avgDayScore || '—'} icon={<TrendingUp className="h-5 w-5" />} />
        <Stat title="Gem. energie" value={stats.avgEnergy || '—'} icon={<Zap className="h-5 w-5" />} />
        <Stat title="Totaal belpogingen" value={stats.totalCalls || 0} icon={<Phone className="h-5 w-5" />} />
        <Stat title="Echte gesprekken" value={stats.totalConversations || 0} icon={<MessageSquare className="h-5 w-5" />} />
        <Stat title="Afspraken/demo's" value={stats.totalAppointments || 0} icon={<Calendar className="h-5 w-5" />} />
        <Stat title="Deals gesloten" value={stats.totalDeals || 0} icon={<Target className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">Gesprekken / Belpogingen</p><p className="text-3xl font-bold mt-1">{stats.conversionRate || 0}%</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">Afspraken / Gesprekken</p><p className="text-3xl font-bold mt-1">{stats.appointmentRate || 0}%</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-sm text-muted-foreground">Deals / Gesprekken</p><p className="text-3xl font-bold mt-1">{stats.dealRate || 0}%</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle className="text-lg">Dagscores & Energie</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dailyData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis domain={[0, 10]} /><Tooltip />
              <Line type="monotone" dataKey="avgDayScore" stroke="hsl(var(--primary))" name="Dagscore" strokeWidth={2} />
              <Line type="monotone" dataKey="avgEnergy" stroke="hsl(var(--chart-2, 150 60% 50%))" name="Energie" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Activiteit per dag</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis /><Tooltip />
              <Bar dataKey="calls" fill="hsl(var(--primary))" name="Belpogingen" />
              <Bar dataKey="conversations" fill="hsl(var(--chart-2, 150 60% 50%))" name="Gesprekken" />
              <Bar dataKey="appointments" fill="hsl(var(--chart-3, 30 80% 55%))" name="Afspraken" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent></Card>
      </div>

      {lowScoreEmployees.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Medewerkers met lage scores</CardTitle></CardHeader>
          <CardContent><div className="space-y-2">
            {lowScoreEmployees.map(e => (
              <div key={e.name} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="font-medium">{e.name}</span>
                <div className="flex gap-4 text-sm">
                  <span className={e.avgDay <= 6 ? 'text-destructive font-medium' : ''}>Dagscore: {e.avgDay}</span>
                  <span className={e.avgEnergy <= 6 ? 'text-destructive font-medium' : ''}>Energie: {e.avgEnergy}</span>
                </div>
              </div>
            ))}
          </div></CardContent>
        </Card>
      )}

      {blockers.length > 0 && (
        <Card><CardHeader><CardTitle className="text-lg">Recente blokkades</CardTitle></CardHeader>
          <CardContent><div className="space-y-2">{blockers.map((b, i) => <div key={i} className="p-3 rounded-lg border bg-card text-sm">{b}</div>)}</div></CardContent>
        </Card>
      )}
    </div>
  );
}
