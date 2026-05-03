import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  from: Date;
  to: Date;
}

interface FunnelEvent {
  funnel_type: string;
  stage: string;
  sales_executive_id: string | null;
  closer_user_id: string | null;
  lead_assignment_id: string | null;
  closer_appointment_id: string | null;
  source_id: string | null;
}

interface Target {
  funnel_type: string;
  from_stage: string;
  to_stage: string;
  target_pct: number;
}

interface Person {
  id: string;
  name: string;
  link?: string;
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

// Stage chains per role
const SE_STAGES = ['dial', 'conversation', 'appointment_booked'];
const CLOSER_STAGES = ['sales_call_1', 'show_up', 'deal_won'];

export default function FunnelPerPerson({ from, to }: Props) {
  const [events, setEvents] = useState<FunnelEvent[] | null>(null);
  const [ses, setSes] = useState<Person[]>([]);
  const [closers, setClosers] = useState<Person[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [seSelected, setSeSelected] = useState<string>('');
  const [closerSelected, setCloserSelected] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      const [ev, { data: sesData }, { data: closersData }, { data: targetsData }] = await Promise.all([
        fetchAll<FunnelEvent>('funnel_events', q =>
          q.select('funnel_type, stage, sales_executive_id, closer_user_id, lead_assignment_id, closer_appointment_id, source_id')
            .gte('event_at', from.toISOString())
            .lte('event_at', to.toISOString())
        ),
        supabase.from('sales_executives').select('id, full_name').eq('status', 'active').order('full_name'),
        supabase.from('profiles').select('user_id, full_name').eq('active', true).order('full_name'),
        supabase.from('funnel_targets').select('funnel_type, from_stage, to_stage, target_pct').eq('scope', 'team'),
      ]);
      setEvents(ev);
      setTargets((targetsData as Target[]) || []);
      const sePeople = (sesData || []).map(s => ({ id: s.id, name: s.full_name || 'Onbekend', link: `/sales-executives/${s.id}` }));
      setSes(sePeople);
      if (sePeople.length && !seSelected) setSeSelected(sePeople[0].id);
      const closerPeople = (closersData || []).map(c => ({ id: c.user_id, name: c.full_name || 'Onbekend' }));
      setClosers(closerPeople);
      if (closerPeople.length && !closerSelected) setCloserSelected(closerPeople[0].id);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const targetFor = (ft: string, fs: string, ts: string) =>
    targets.find(t => t.funnel_type === ft && t.from_stage === fs && t.to_stage === ts)?.target_pct ?? null;

  const buildFlow = (
    stages: string[],
    funnelType: string,
    matcher: (e: FunnelEvent) => boolean,
    distinctKey: (e: FunnelEvent) => string,
  ) => {
    if (!events) return null;
    const countFor = (stage: string) => {
      const set = new Set<string>();
      events.filter(e => e.funnel_type === funnelType && e.stage === stage && matcher(e)).forEach(e => set.add(distinctKey(e)));
      return set.size;
    };
    return stages.map((s, i) => {
      const count = countFor(s);
      const prev = i > 0 ? countFor(stages[i - 1]) : null;
      const target = i > 0 ? targetFor(funnelType, stages[i - 1], s) : null;
      const actual = prev !== null && prev > 0 ? (count / prev) * 100 : null;
      return { stage: s, count, actual, target };
    });
  };

  const seFlow = useMemo(() => {
    if (!seSelected) return null;
    return buildFlow(
      SE_STAGES,
      'cold_call',
      e => e.sales_executive_id === seSelected,
      e => e.lead_assignment_id || e.source_id || crypto.randomUUID(),
    );
  }, [events, targets, seSelected]);

  const closerFlow = useMemo(() => {
    if (!closerSelected) return null;
    return buildFlow(
      CLOSER_STAGES,
      'one_call_close',
      e => e.closer_user_id === closerSelected,
      e => e.closer_appointment_id || e.source_id || crypto.randomUUID(),
    );
  }, [events, targets, closerSelected]);

  const selectedSeLink = ses.find(s => s.id === seSelected)?.link;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Funnel performance per persoon
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Individuele conversie flow vs team targets. Selecteer een persoon.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="se" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="se">Sales Executives, cold call</TabsTrigger>
            <TabsTrigger value="closer">Closers, deals</TabsTrigger>
          </TabsList>

          <TabsContent value="se" className="mt-0 space-y-4">
            {ses.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Geen actieve Sales Executives</div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Select value={seSelected} onValueChange={setSeSelected}>
                    <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ses.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedSeLink && (
                    <Link to={selectedSeLink} className="text-xs text-primary hover:underline">Open profiel</Link>
                  )}
                </div>
                <FlowDisplay flow={seFlow} />
              </>
            )}
          </TabsContent>

          <TabsContent value="closer" className="mt-0 space-y-4">
            {closers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Geen actieve closers</div>
            ) : (
              <>
                <Select value={closerSelected} onValueChange={setCloserSelected}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {closers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FlowDisplay flow={closerFlow} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function FlowDisplay({ flow }: { flow: { stage: string; count: number; actual: number | null; target: number | null }[] | null }) {
  if (!flow) {
    return <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  return (
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
  const colorClass = actual === null || target === null
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
