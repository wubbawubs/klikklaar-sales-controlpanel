import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

export default function ResponsesPage() {
  const [responses, setResponses] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [filters, setFilters] = useState({ form_id: 'all', team: 'all', employee: '', dateFrom: '', dateTo: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('forms').select('id, title').order('title');
      setForms(data || []);
    })();
  }, []);

  useEffect(() => { loadResponses(); }, [filters]);

  const loadResponses = async () => {
    let query = (supabase as any).from('eod_submission_data').select('*').order('created_at', { ascending: false });
    if (filters.form_id !== 'all') query = query.eq('form_id', filters.form_id);
    if (filters.team !== 'all') query = query.eq('team', filters.team);
    if (filters.employee) query = query.ilike('employee_name', `%${filters.employee}%`);
    if (filters.dateFrom) query = query.gte('work_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('work_date', filters.dateTo);
    const { data } = await query.limit(200);
    setResponses(data || []);
    setLoading(false);
  };

  const exportCSV = () => {
    if (!responses.length) return;
    const headers = ['Medewerker', 'Team', 'Datum', 'Belpogingen', 'Gesprekken', 'Afspraken', 'Vervolgacties', 'Deals', 'Dagscore', 'Energie', 'Wat ging goed', 'Blokkade', 'Coaching', 'Focus morgen'];
    const rows = responses.map(r => [
      r.employee_name, r.team, r.work_date, r.calls_attempted, r.real_conversations, r.appointments_set, r.followups_set, r.deals_closed, r.day_score, r.energy_score,
      `"${(r.good_things || '').replace(/"/g, '""')}"`, `"${(r.blocker_text || '').replace(/"/g, '""')}"`, `"${(r.coaching_text || '').replace(/"/g, '""')}"`, `"${(r.focus_tomorrow || '').replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `responses-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV geëxporteerd');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Responses</h1><p className="text-muted-foreground">Alle ingevulde evaluaties</p></div>
        <Button onClick={exportCSV} variant="outline"><Download className="mr-2 h-4 w-4" />Exporteer CSV</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Select value={filters.form_id} onValueChange={v => setFilters({ ...filters, form_id: v })}>
              <SelectTrigger><SelectValue placeholder="Formulier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle formulieren</SelectItem>
                {forms.map((f: any) => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.team} onValueChange={v => setFilters({ ...filters, team: v })}>
              <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle teams</SelectItem>
                <SelectItem value="Sales Executive">Sales Executive</SelectItem>
                <SelectItem value="Sales Support">Sales Support</SelectItem>
                <SelectItem value="Management">Management</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Medewerker..." value={filters.employee} onChange={e => setFilters({ ...filters, employee: e.target.value })} />
            <Input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
            <Input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medewerker</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Belpogingen</TableHead>
                <TableHead>Gesprekken</TableHead>
                <TableHead>Afspraken</TableHead>
                <TableHead>Dagscore</TableHead>
                <TableHead>Energie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {responses.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.employee_name || '—'}</TableCell>
                  <TableCell>{r.team || '—'}</TableCell>
                  <TableCell>{r.work_date}</TableCell>
                  <TableCell>{r.calls_attempted}</TableCell>
                  <TableCell>{r.real_conversations}</TableCell>
                  <TableCell>{r.appointments_set}</TableCell>
                  <TableCell className={r.day_score <= 6 ? 'text-destructive font-medium' : ''}>{r.day_score}</TableCell>
                  <TableCell className={r.energy_score <= 6 ? 'text-destructive font-medium' : ''}>{r.energy_score}</TableCell>
                </TableRow>
              ))}
              {responses.length === 0 && !loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Geen responses gevonden</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
