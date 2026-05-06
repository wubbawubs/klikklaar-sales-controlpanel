import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, GitBranch, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
}

const STAGE_LABELS: Record<string, string> = {
  dial: 'Dials',
  conversation: 'Gesprek',
  appointment_booked: 'Afspraak',
  show_up: 'Show-up',
  sales_call_1: 'Sales call 1',
  follow_up: 'Follow up',
  deal_won: 'Deal gewonnen',
  deal_lost: 'Deal verloren',
};

const FUNNEL_LABELS: Record<string, string> = {
  cold_call: 'Cold call',
  one_call_close: '1-call close',
  follow_up_close: 'Follow up close',
  mail_close: 'Mail close',
  reengage_close: 'Re-engage',
  lost: 'Lost',
};

const FUNNEL_ORDER = ['cold_call', 'one_call_close', 'follow_up_close', 'mail_close', 'reengage_close', 'lost'];

export default function FunnelConversionMatrix({ from, to }: Props) {
  const [events, setEvents] = useState<FunnelEvent[] | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [activeFunnel, setActiveFunnel] = useState<string>('cold_call');
  const orgId = useOrgId();

  useEffect(() => {
    const load = async () => {
      const [ev, { data: targetsData }] = await Promise.all([
        fetchAll<FunnelEvent>('funnel_events', q => {
          let qq = q.select('funnel_type, stage, source_id, lead_assignment_id, closer_appointment_id, organization_id')
            .gte('event_at', from.toISOString())
            .lte('event_at', to.toISOString());
          if (orgId) qq = qq.eq('organization_id', orgId);
          return qq;
        }),
        supabase.from('funnel_targets').select('funnel_type, from_stage, to_stage, target_pct').eq('scope', 'team'),
      ]);
      setEvents(ev);
      setTargets((targetsData as Target[]) || []);
    };
    load();
  }, [from, to, orgId]);

  const availableFunnels = useMemo(() => {
    const set = new Set<string>(targets.map(t => t.funnel_type));
    return FUNNEL_ORDER.filter(f => set.has(f));
  }, [targets]);

  // Build ordered stage flow for the active funnel based on target rows
  const flow = useMemo(() => {
    if (!events) return null;
    const funnelTargets = targets.filter(t => t.funnel_type === activeFunnel);
    if (funnelTargets.length === 0) return [];

    // Order stages by chaining from_stage -> to_stage
    const stages: string[] = [];
    const fromMap = new Map(funnelTargets.map(t => [t.from_stage, t]));
    // start: a from_stage that is not any to_stage
    const toStages = new Set(funnelTargets.map(t => t.to_stage));
    const start = funnelTargets.find(t => !toStages.has(t.from_stage))?.from_stage || funnelTargets[0].from_stage;
    let cur: string | undefined = start;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      stages.push(cur);
      seen.add(cur);
      cur = fromMap.get(cur)?.to_stage;
    }
    if (cur && !seen.has(cur)) stages.push(cur);

    // Counts per stage (distinct lead/appointment id)
    const countFor = (stage: string) => {
      const set = new Set<string>();
      events.filter(e => e.funnel_type === activeFunnel && e.stage === stage).forEach(e => {
        set.add(e.lead_assignment_id || e.closer_appointment_id || e.source_id || crypto.randomUUID());
      });
      return set.size;
    };

    return stages.map((s, i) => {
      const count = countFor(s);
      const prevCount = i > 0 ? countFor(stages[i - 1]) : null;
      const target = i > 0 ? funnelTargets.find(t => t.from_stage === stages[i - 1] && t.to_stage === s)?.target_pct ?? null : null;
      const actual = prevCount !== null && prevCount > 0 ? (count / prevCount) * 100 : null;
      return { stage: s, count, actual, target };
    });
  }, [events, targets, activeFunnel]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Conversie funnel
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Stage naar stage conversie vs target. Groen = op of boven, geel = binnen 10%, rood = eronder.
            </p>
          </div>
          {availableFunnels.length > 0 && (
            <Tabs value={activeFunnel} onValueChange={setActiveFunnel}>
              <TabsList className="h-8">
                {availableFunnels.map(f => (
                  <TabsTrigger key={f} value={f} className="text-xs px-2.5">
                    {FUNNEL_LABELS[f] || f}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!flow ? (
          <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : flow.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Geen targets voor deze funnel. Stel ze in via Settings, Funnel targets.
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex items-stretch gap-2 min-w-max">
              {flow.map((node, i) => (
                <div key={node.stage} className="flex items-center gap-2">
                  {i > 0 && <ConversionArrow actual={node.actual} target={node.target} />}
                  <StageBlock label={STAGE_LABELS[node.stage] || node.stage} count={node.count} highlight={i === 0} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StageBlock({ label, count, highlight }: { label: string; count: number; highlight?: boolean }) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-xl border px-5 py-4 min-w-[120px]',
      highlight ? 'bg-primary/10 border-primary/30' : 'bg-muted/30 border-border/60'
    )}>
      <div className="text-2xl font-bold tabular-nums text-foreground">{count}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 text-center whitespace-nowrap">{label}</div>
    </div>
  );
}

function ConversionArrow({ actual, target }: { actual: number | null; target: number | null }) {
  const onTarget = target !== null && actual !== null && actual >= target;
  const nearTarget = target !== null && actual !== null && actual >= target * 0.9;
  const colorClass = actual === null
    ? 'text-muted-foreground'
    : target === null
      ? 'text-muted-foreground'
      : onTarget ? 'text-success' : nearTarget ? 'text-warning' : 'text-destructive';
  const Icon = actual === null || target === null ? Minus : onTarget ? TrendingUp : nearTarget ? Minus : TrendingDown;
  const delta = actual !== null && target !== null ? actual - target : null;

  return (
    <div className="flex flex-col items-center justify-center px-1 min-w-[90px]">
      <div className={cn('text-sm font-semibold tabular-nums inline-flex items-center gap-1', colorClass)}>
        <Icon className="h-3.5 w-3.5" />
        {actual !== null ? `${actual.toFixed(1)}%` : '–'}
      </div>
      {target !== null && (
        <div className="text-[10px] text-muted-foreground tabular-nums">
          target {target.toFixed(0)}%
          {delta !== null && (
            <span className={cn('ml-1', delta >= 0 ? 'text-success' : 'text-destructive')}>
              ({delta >= 0 ? '+' : ''}{delta.toFixed(0)})
            </span>
          )}
        </div>
      )}
      <ArrowRight className={cn('h-4 w-4 mt-1', colorClass)} />
    </div>
  );
}
