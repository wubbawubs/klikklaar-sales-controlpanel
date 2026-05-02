import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, GitBranch, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  from: Date;
  to: Date;
}

interface FunnelEvent {
  funnel_type: string;
  stage: string;
  source_id: string | null;
  lead_assignment_id: string | null;
  closer_appointment_id: string | null;
}

interface Target {
  funnel_type: string;
  from_stage: string;
  to_stage: string;
  target_pct: number;
  scope: string;
}

interface Row {
  funnel_type: string;
  from_stage: string;
  to_stage: string;
  from_count: number;
  to_count: number;
  actual_pct: number;
  target_pct: number | null;
}

const STAGE_LABELS: Record<string, string> = {
  dial: 'Dial',
  conversation: 'Gesprek',
  appointment_booked: 'Afspraak geboekt',
  show_up: 'Show, up',
  sales_call_1: 'Sales call 1',
  follow_up: 'Follow up',
  deal_won: 'Deal gewonnen',
  deal_lost: 'Deal verloren',
};

const FUNNEL_LABELS: Record<string, string> = {
  cold_call: 'Cold call',
  one_call_close: '1, call close',
  follow_up_close: 'Follow up close',
  mail_close: 'Mail close',
  reengage_close: 'Re, engage',
  lost: 'Lost',
};

export default function FunnelConversionMatrix({ from, to }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const load = async () => {
      const [events, { data: targetsData }] = await Promise.all([
        fetchAll<FunnelEvent>('funnel_events', q =>
          q.select('funnel_type, stage, source_id, lead_assignment_id, closer_appointment_id')
            .gte('event_at', from.toISOString())
            .lte('event_at', to.toISOString())
        ),
        supabase.from('funnel_targets').select('funnel_type, from_stage, to_stage, target_pct, scope').eq('scope', 'team'),
      ]);
      const targets = (targetsData as Target[]) || [];

      // Count distinct lead/appointment per (funnel_type, stage)
      const counts = new Map<string, Set<string>>();
      for (const e of events) {
        const key = `${e.funnel_type}|${e.stage}`;
        if (!counts.has(key)) counts.set(key, new Set());
        const id = e.lead_assignment_id || e.closer_appointment_id || e.source_id || crypto.randomUUID();
        counts.get(key)!.add(id);
      }

      const result: Row[] = targets.map(t => {
        const fromCount = counts.get(`${t.funnel_type}|${t.from_stage}`)?.size || 0;
        const toCount = counts.get(`${t.funnel_type}|${t.to_stage}`)?.size || 0;
        const actual = fromCount > 0 ? (toCount / fromCount) * 100 : 0;
        return {
          funnel_type: t.funnel_type,
          from_stage: t.from_stage,
          to_stage: t.to_stage,
          from_count: fromCount,
          to_count: toCount,
          actual_pct: actual,
          target_pct: t.target_pct,
        };
      });

      setRows(result);
    };
    load();
  }, [from, to]);

  const StatusIcon = ({ actual, target }: { actual: number; target: number | null }) => {
    if (target === null) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    if (actual >= target) return <TrendingUp className="h-3.5 w-3.5 text-success" />;
    if (actual >= target * 0.9) return <Minus className="h-3.5 w-3.5 text-warning" />;
    return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  };

  // Group by funnel_type
  const grouped = rows ? rows.reduce((acc, r) => {
    if (!acc[r.funnel_type]) acc[r.funnel_type] = [];
    acc[r.funnel_type].push(r);
    return acc;
  }, {} as Record<string, Row[]>) : {};

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          Conversie matrix per funnel
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Actuele conversies vs targets per stage overgang. Groen = op of boven target, geel = binnen 10%, rood = eronder.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {!rows ? (
          <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nog geen targets geconfigureerd. Stel ze in via Settings, Funnel targets.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funnel</TableHead>
                  <TableHead>Van stage</TableHead>
                  <TableHead>Naar stage</TableHead>
                  <TableHead className="text-right">Bron</TableHead>
                  <TableHead className="text-right">Doel</TableHead>
                  <TableHead className="text-right">Actueel</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(grouped).map(([funnel, items]) => (
                  items.map((r, idx) => {
                    const delta = r.target_pct !== null ? r.actual_pct - r.target_pct : null;
                    const onTarget = r.target_pct !== null && r.actual_pct >= r.target_pct;
                    const nearTarget = r.target_pct !== null && r.actual_pct >= r.target_pct * 0.9;
                    return (
                      <TableRow key={`${funnel}-${r.from_stage}-${r.to_stage}`} className="hover:bg-muted/40">
                        <TableCell className="font-medium">
                          {idx === 0 ? (
                            <Badge variant="outline" className="font-normal">{FUNNEL_LABELS[funnel] || funnel}</Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{STAGE_LABELS[r.from_stage] || r.from_stage}</TableCell>
                        <TableCell className="text-muted-foreground">{STAGE_LABELS[r.to_stage] || r.to_stage}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.from_count}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.to_count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={cn(
                            'font-semibold inline-flex items-center gap-1',
                            onTarget ? 'text-success' : nearTarget ? 'text-warning' : 'text-destructive'
                          )}>
                            <StatusIcon actual={r.actual_pct} target={r.target_pct} />
                            {r.actual_pct.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.target_pct !== null ? `${r.target_pct.toFixed(0)}%` : ', '}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {delta !== null ? (
                            <span className={cn(delta >= 0 ? 'text-success' : 'text-destructive')}>
                              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                            </span>
                          ) : ', '}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
