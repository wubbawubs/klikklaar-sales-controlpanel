import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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

interface PersonRow {
  id: string;
  name: string;
  dials: number;
  conversations: number;
  appointments: number;
  shows: number;
  deals: number;
  conv_dial_to_conv: number;
  conv_conv_to_appt: number;
  conv_appt_to_show: number;
  conv_appt_to_deal: number;
}

export default function FunnelPerPerson({ from, to }: Props) {
  const [seRows, setSeRows] = useState<PersonRow[] | null>(null);
  const [closerRows, setCloserRows] = useState<PersonRow[] | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    const load = async () => {
      const [events, { data: ses }, { data: closers }, { data: targetsData }] = await Promise.all([
        fetchAll<FunnelEvent>('funnel_events', q =>
          q.select('funnel_type, stage, sales_executive_id, closer_user_id, lead_assignment_id, closer_appointment_id, source_id')
            .gte('event_at', from.toISOString())
            .lte('event_at', to.toISOString())
        ),
        supabase.from('sales_executives').select('id, full_name, status').eq('status', 'active'),
        supabase.from('profiles').select('user_id, full_name').eq('active', true),
        supabase.from('funnel_targets').select('funnel_type, from_stage, to_stage, target_pct').eq('scope', 'team'),
      ]);

      setTargets((targetsData as Target[]) || []);

      // Per SE: count cold_call funnel stages (distinct lead_assignment per stage)
      const sePeople: PersonRow[] = (ses || []).map(se => {
        const seEvents = events.filter(e => e.sales_executive_id === se.id && e.funnel_type === 'cold_call');
        const distinctByStage = (stage: string) => {
          const set = new Set<string>();
          seEvents.filter(e => e.stage === stage).forEach(e => {
            set.add(e.lead_assignment_id || e.source_id || crypto.randomUUID());
          });
          return set.size;
        };
        const dials = distinctByStage('dial');
        const conversations = distinctByStage('conversation');
        const appointments = distinctByStage('appointment_booked');
        return {
          id: se.id,
          name: se.full_name || 'Onbekend',
          dials,
          conversations,
          appointments,
          shows: 0,
          deals: 0,
          conv_dial_to_conv: dials > 0 ? (conversations / dials) * 100 : 0,
          conv_conv_to_appt: conversations > 0 ? (appointments / conversations) * 100 : 0,
          conv_appt_to_show: 0,
          conv_appt_to_deal: 0,
        };
      });
      sePeople.sort((a, b) => b.dials - a.dials);
      setSeRows(sePeople);

      // Per Closer: count close funnels (distinct closer_appointment per stage)
      const closerPeople: PersonRow[] = (closers || []).map(c => {
        const cEvents = events.filter(e => e.closer_user_id === c.user_id);
        const distinctByStage = (stage: string) => {
          const set = new Set<string>();
          cEvents.filter(e => e.stage === stage).forEach(e => {
            set.add(e.closer_appointment_id || e.source_id || crypto.randomUUID());
          });
          return set.size;
        };
        const appointments = distinctByStage('sales_call_1');
        const shows = distinctByStage('show_up');
        const deals = distinctByStage('deal_won');
        return {
          id: c.user_id,
          name: c.full_name || 'Onbekend',
          dials: 0,
          conversations: 0,
          appointments,
          shows,
          deals,
          conv_dial_to_conv: 0,
          conv_conv_to_appt: 0,
          conv_appt_to_show: appointments > 0 ? (shows / appointments) * 100 : 0,
          conv_appt_to_deal: appointments > 0 ? (deals / appointments) * 100 : 0,
        };
      }).filter(c => c.appointments > 0 || c.deals > 0);
      closerPeople.sort((a, b) => b.deals - a.deals);
      setCloserRows(closerPeople);
    };
    load();
  }, [from, to]);

  const targetFor = (ft: string, from_stage: string, to_stage: string) =>
    targets.find(t => t.funnel_type === ft && t.from_stage === from_stage && t.to_stage === to_stage)?.target_pct ?? null;

  const Cell = ({ value, target }: { value: number; target: number | null }) => {
    if (target === null) return <span className="tabular-nums">{value.toFixed(1)}%</span>;
    const onTarget = value >= target;
    const nearTarget = value >= target * 0.9;
    const Icon = onTarget ? TrendingUp : nearTarget ? Minus : TrendingDown;
    return (
      <span className={cn(
        'tabular-nums inline-flex items-center gap-1',
        onTarget ? 'text-success font-semibold' : nearTarget ? 'text-warning' : 'text-destructive'
      )}>
        <Icon className="h-3 w-3" />
        {value.toFixed(1)}%
      </span>
    );
  };

  const t_dial_conv = targetFor('cold_call', 'dial', 'conversation');
  const t_conv_appt = targetFor('cold_call', 'conversation', 'appointment_booked');
  const t_appt_show = targetFor('cold_call', 'appointment_booked', 'show_up');
  const t_call_deal = targetFor('one_call_close', 'sales_call_1', 'deal_won');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Funnel performance per persoon
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Individuele conversies per stage vs team targets. Distinct leads of afspraken per stage.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="se" className="w-full">
          <div className="px-4 pt-2">
            <TabsList>
              <TabsTrigger value="se">Sales Executives, cold call</TabsTrigger>
              <TabsTrigger value="closer">Closers, deals</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="se" className="mt-0">
            {!seRows ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : seRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Geen actieve Sales Executives</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sales Executive</TableHead>
                      <TableHead className="text-right">Dials</TableHead>
                      <TableHead className="text-right">Gesprekken</TableHead>
                      <TableHead className="text-right">Afspraken</TableHead>
                      <TableHead className="text-right">Dial, Gesprek</TableHead>
                      <TableHead className="text-right">Gesprek, Afspraak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seRows.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/40">
                        <TableCell>
                          <Link to={`/sales-executives/${r.id}`} className="font-medium hover:text-primary">{r.name}</Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.dials}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.conversations}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.appointments}</TableCell>
                        <TableCell className="text-right"><Cell value={r.conv_dial_to_conv} target={t_dial_conv} /></TableCell>
                        <TableCell className="text-right"><Cell value={r.conv_conv_to_appt} target={t_conv_appt} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="closer" className="mt-0">
            {!closerRows ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : closerRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nog geen closer activiteit in deze periode</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Closer</TableHead>
                      <TableHead className="text-right">Sales calls</TableHead>
                      <TableHead className="text-right">Show, ups</TableHead>
                      <TableHead className="text-right">Deals</TableHead>
                      <TableHead className="text-right">Show, up %</TableHead>
                      <TableHead className="text-right">Call, Deal %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closerRows.map(r => (
                      <TableRow key={r.id} className="hover:bg-muted/40">
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.appointments}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.shows}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-success">{r.deals}</TableCell>
                        <TableCell className="text-right"><Cell value={r.conv_appt_to_show} target={t_appt_show} /></TableCell>
                        <TableCell className="text-right"><Cell value={r.conv_appt_to_deal} target={t_call_deal} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
