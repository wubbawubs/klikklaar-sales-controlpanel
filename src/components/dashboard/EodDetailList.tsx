import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Phone, MessageSquare, CalendarCheck, RefreshCw, CheckCircle, Star, Zap, MessageCircle } from 'lucide-react';
import type { EodSubmission } from '@/types/database';

interface EodData {
  calls_attempted?: number | null;
  real_conversations?: number | null;
  appointments_set?: number | null;
  followups_set?: number | null;
  deals_closed?: number | null;
  day_score?: number | null;
  energy_score?: number | null;
  good_things?: string | null;
  blocker_text?: string | null;
  coaching_text?: string | null;
  focus_tomorrow?: string | null;
  extra_notes?: string | null;
  product_lines?: string[] | null;
}

interface Props {
  eods: EodSubmission[];
  salesExecutiveId: string;
}

export function EodDetailList({ eods, salesExecutiveId }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [eodData, setEodData] = useState<Record<string, EodData>>({});
  const [loadingData, setLoadingData] = useState<Record<string, boolean>>({});

  const toggle = async (eodId: string) => {
    const isOpen = !expanded[eodId];
    setExpanded(prev => ({ ...prev, [eodId]: isOpen }));

    if (isOpen && !eodData[eodId]) {
      setLoadingData(prev => ({ ...prev, [eodId]: true }));
      const eod = eods.find(e => e.id === eodId);
      if (eod) {
        const dateStart = new Date(eod.session_date);
        const dateEnd = new Date(dateStart.getTime() + 86400000);
        const { data } = await supabase
          .from('eod_submission_data')
          .select('*')
          .eq('sales_executive_id', salesExecutiveId)
          .gte('work_date', dateStart.toISOString().split('T')[0])
          .lte('work_date', dateStart.toISOString().split('T')[0])
          .limit(1)
          .maybeSingle();

        if (data) {
          setEodData(prev => ({ ...prev, [eodId]: data }));
        }
      }
      setLoadingData(prev => ({ ...prev, [eodId]: false }));
    }
  };

  if (eods.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        Nog geen EOD-inzendingen
      </CardContent></Card>
    );
  }

  const MetricRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number | null | undefined }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className="flex items-center gap-2 py-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium ml-auto">{value}</span>
      </div>
    );
  };

  const TextBlock = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm bg-muted p-2 rounded-md">{value}</p>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {eods.map(eod => {
        const isOpen = expanded[eod.id] || false;
        const data = eodData[eod.id];
        const isLoading = loadingData[eod.id];
        const summaryJson = eod.summary_json as Record<string, any> | null;

        return (
          <Card key={eod.id}>
            <Collapsible open={isOpen} onOpenChange={() => toggle(eod.id)}>
              <CollapsibleTrigger asChild>
                <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="font-medium">{new Date(eod.session_date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={eod.status} />
                      <StatusBadge status={eod.follow_up_status} />
                    </div>
                  </div>
                  {eod.coach_notes && (
                    <p className="text-xs text-muted-foreground mt-1 ml-7 flex items-center gap-1">
                      <MessageCircle className="h-3 w-3 shrink-0" /> {eod.coach_notes}
                    </p>
                  )}
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 border-t pt-3 space-y-4">
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Laden...</p>
                  ) : (() => {
                    const d = data || null;
                    const s = summaryJson || {};
                    const hasDetail = !!d;
                    const hasAnything = hasDetail || Object.keys(s).length > 0;

                    if (!hasAnything) {
                      return <p className="text-sm text-muted-foreground italic">Geen gedetailleerde data beschikbaar voor deze inzending.</p>;
                    }

                    return (
                      <>
                        <div className="grid grid-cols-2 gap-x-8 text-sm">
                          <div className="space-y-0.5">
                            <MetricRow icon={Phone} label="Pogingen" value={d?.calls_attempted ?? s.calls ?? s.calls_attempted} />
                            <MetricRow icon={MessageSquare} label="Gesprekken" value={d?.real_conversations ?? s.conversations ?? s.real_conversations} />
                            <MetricRow icon={CalendarCheck} label="Afspraken" value={d?.appointments_set ?? s.appointments ?? s.appointments_set} />
                          </div>
                          <div className="space-y-0.5">
                            <MetricRow icon={RefreshCw} label="Follow-ups" value={d?.followups_set ?? s.followups ?? s.followups_set} />
                            <MetricRow icon={CheckCircle} label="Deals" value={d?.deals_closed ?? s.deals ?? s.deals_closed} />
                            <MetricRow icon={Star} label="Dagscore" value={(d?.day_score ?? s.day_score) ? `${d?.day_score ?? s.day_score}/10` : null} />
                            <MetricRow icon={Zap} label="Energie" value={(d?.energy_score ?? s.energy_score) ? `${d?.energy_score ?? s.energy_score}/10` : null} />
                          </div>
                        </div>

                        {d?.product_lines && d.product_lines.length > 0 && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Productlijnen: </span>
                            <span>{d.product_lines.join(', ')}</span>
                          </div>
                        )}

                        {hasDetail && (
                          <div className="space-y-2 text-sm">
                            <TextBlock label="Wat ging goed?" value={d?.good_things} />
                            <TextBlock label="Blokkades" value={d?.blocker_text} />
                            <TextBlock label="Coaching nodig" value={d?.coaching_text} />
                            <TextBlock label="Focus morgen" value={d?.focus_tomorrow} />
                            <TextBlock label="Extra notities" value={d?.extra_notes} />
                          </div>
                        )}

                        {!hasDetail && (
                          <p className="text-xs text-muted-foreground italic">Alleen samenvattingsdata beschikbaar. Open velden zijn niet ingevuld voor deze inzending.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
