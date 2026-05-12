import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ExpandableNote } from '@/components/ui/expandable-note';
import { CLOSER_STATUSES, type CloserStatus } from '@/lib/closer-statuses';
import { Building2, Calendar, Euro, RefreshCw, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  org_name: string | null;
  contact_name: string | null;
  scheduled_at: string | null;
  status: CloserStatus;
  deal_value_eur: number | null;
  last_activity_at: string;
  notes: string | null;
  closer_user_id: string;
  closer_name?: string | null;
}

const STATUS_TONE: Record<string, string> = CLOSER_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.tone }), {} as Record<string, string>
);
const STATUS_LABEL: Record<string, string> = CLOSER_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }), {} as Record<string, string>
);

export default function CloserStatusList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  const load = useCallback(async () => {
    if (!user) return;
    // Resolve SE id (caller link)
    const email = (user.email ?? '').trim().toLowerCase();
    const { data: se } = await supabase
      .from('sales_executives')
      .select('id')
      .or(`email.ilike.${email},user_id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();
    if (!se) { setRows([]); setLoading(false); return; }

    const { data } = await supabase
      .from('closer_appointments')
      .select('id, org_name, contact_name, scheduled_at, status, deal_value_eur, last_activity_at, notes, closer_user_id')
      .eq('caller_sales_executive_id', se.id)
      .order('last_activity_at', { ascending: false });

    const list = (data ?? []) as Row[];

    // Resolve closer names
    const closerIds = [...new Set(list.map(r => r.closer_user_id))];
    if (closerIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', closerIds);
      const map = Object.fromEntries((profs ?? []).map(p => [p.user_id, p.full_name]));
      list.forEach(r => { r.closer_name = map[r.closer_user_id] ?? null; });
    }

    setRows(list);
    setLastSync(new Date());
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('closer-status-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closer_appointments' }, () => load())
      .subscribe();
    const i = setInterval(load, 2 * 60 * 1000);
    return () => { supabase.removeChannel(ch); clearInterval(i); };
  }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Bij closer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} doorgezette leads · Sync: {lastSync.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Ververs
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nog geen leads bij een closer. Zodra je een afspraak inplant verschijnt deze hier.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Bedrijf / contact</TableHead>
                    <TableHead className="w-36">Afspraak</TableHead>
                    <TableHead className="w-32">Closer</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24 text-right">Deal</TableHead>
                    <TableHead className="w-28">Update</TableHead>
                    <TableHead className="min-w-[160px]">Notities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[220px]">{r.org_name || '—'}</div>
                            {r.contact_name && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{r.contact_name}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.scheduled_at ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(r.scheduled_at).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {r.closer_name ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          STATUS_TONE[r.status] ?? ''
                        )}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {(r.status === 'deal' || r.status === 'nog_betalen') && r.deal_value_eur ? (
                          <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                            <Euro className="h-3 w-3" />
                            {Number(r.deal_value_eur).toLocaleString('nl-NL')}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.last_activity_at).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
                      </TableCell>
                      <TableCell>
                        {r.notes ? (
                          <ExpandableNote text={r.notes} title="Notitie closer" lineClamp={2} />
                        ) : <span className="text-[11px] text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
