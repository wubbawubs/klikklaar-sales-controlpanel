import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, AlertTriangle, PhoneCall, Activity, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Snapshot {
  eodReceived: number;
  eodExpected: number;
  eodSpark: number[];
  callbacksToday: number;
  staleLeads: number;
  openSignals: { id: string; title: string; severity: string; created_at: string }[];
  healthEvents: { id: string; check_type: string; status: string; error_message: string | null; created_at: string }[];
}

export default function OperationalSignals() {
  const [data, setData] = useState<Snapshot | null>(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

      const [{ data: ses }, eodWeek, callbacks, leads, signalsRes, healthRes] = await Promise.all([
        supabase.from('sales_executives').select('id').eq('status', 'active'),
        supabase.from('eod_submissions').select('session_date, status').gte('session_date', sevenDaysAgo),
        supabase.from('calls').select('id').eq('outcome', 'callback').not('callback_date', 'is', null).lte('callback_date', today),
        fetchAll<any>('pipedrive_lead_assignments', q =>
          q.select('id, updated_at, status').in('status', ['assigned', 'contacted'])
        ),
        supabase.from('signals').select('id, title, severity, created_at').eq('resolved', false).order('created_at', { ascending: false }).limit(5),
        supabase.from('health_events').select('id, check_type, status, error_message, created_at').neq('status', 'ok').order('created_at', { ascending: false }).limit(5),
      ]);

      const expected = ses?.length ?? 0;
      const eodToday = (eodWeek.data || []).filter((e: any) => e.session_date === today && e.status !== 'pending').length;

      // 7-day spark
      const spark: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        const c = (eodWeek.data || []).filter((e: any) => e.session_date === d && e.status !== 'pending').length;
        spark.push(c);
      }

      const cutoff = Date.now() - 7 * 86400000;
      const stale = leads.filter(l => new Date(l.updated_at).getTime() < cutoff).length;

      setData({
        eodReceived: eodToday,
        eodExpected: expected,
        eodSpark: spark,
        callbacksToday: (callbacks.data || []).length,
        staleLeads: stale,
        openSignals: (signalsRes.data || []) as any,
        healthEvents: (healthRes.data || []) as any,
      });
    };
    load();
  }, []);

  if (!data) {
    return (
      <Card><CardContent className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>
    );
  }

  const eodPct = data.eodExpected > 0 ? Math.round((data.eodReceived / data.eodExpected) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Operationele signalen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Top mini-stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MiniStat
            icon={ClipboardCheck}
            label="EOD vandaag"
            value={`${data.eodReceived}/${data.eodExpected}`}
            sub={`${eodPct}% compliance`}
            spark={data.eodSpark}
            tone={eodPct >= 80 ? 'success' : eodPct >= 50 ? 'warning' : 'destructive'}
          />
          <MiniStat
            icon={PhoneCall}
            label="Callbacks vandaag"
            value={data.callbacksToday}
            sub="te bellen voor EOD"
            tone={data.callbacksToday > 10 ? 'warning' : 'default'}
          />
          <MiniStat
            icon={AlertTriangle}
            label="Stale leads"
            value={data.staleLeads}
            sub="> 7 dagen geen update"
            tone={data.staleLeads > 20 ? 'destructive' : data.staleLeads > 5 ? 'warning' : 'default'}
          />
        </div>

        {/* Open signals + health events side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Open signalen</p>
              <Link to="/sales-executives" className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
                bekijken <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-1.5">
              {data.openSignals.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">Geen open signalen</p>
              ) : (
                data.openSignals.map(s => (
                  <div key={s.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
                    <div className={cn(
                      'mt-1 w-1.5 h-1.5 rounded-full shrink-0',
                      s.severity === 'critical' ? 'bg-destructive' : s.severity === 'warning' ? 'bg-warning' : 'bg-info'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground line-clamp-1">{s.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: nl })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Health events</p>
            <div className="space-y-1.5">
              {data.healthEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">Alle systemen ok</p>
              ) : (
                data.healthEvents.map(h => (
                  <div key={h.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/40">
                    <AlertTriangle className={cn(
                      'h-3.5 w-3.5 mt-0.5 shrink-0',
                      h.status === 'critical' ? 'text-destructive' : 'text-warning'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground line-clamp-1">{h.check_type}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {h.error_message || 'geen details'} | {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: nl })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon: Icon, label, value, sub, spark, tone = 'default',
}: {
  icon: typeof Activity; label: string; value: number | string; sub: string; spark?: number[];
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const tones = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  };
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        {spark && <Spark data={spark} />}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', tones[tone])}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const w = 50, h = 16;
  const step = w / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="text-primary/50">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.25" points={points} />
    </svg>
  );
}
