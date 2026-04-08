import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
      const { data } = await supabase
        .from('eod_submission_data')
        .select('*')
        .eq('sales_executive_id', salesExecutiveId)
        .gte('created_at', new Date(eods.find(e => e.id === eodId)?.session_date || '').toISOString())
        .lte('created_at', new Date(new Date(eods.find(e => e.id === eodId)?.session_date || '').getTime() + 86400000).toISOString())
        .limit(1)
        .maybeSingle();

      if (data) {
        setEodData(prev => ({ ...prev, [eodId]: data }));
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

  const MetricRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className="flex justify-between py-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
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
                    <p className="text-xs text-muted-foreground mt-1 ml-7">💬 {eod.coach_notes}</p>
                  )}
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 border-t pt-3 space-y-4">
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Laden...</p>
                  ) : data ? (
                    <>
                      {/* Metrics */}
                      <div className="grid grid-cols-2 gap-x-8 text-sm">
                        <div className="space-y-0.5">
                          <MetricRow label="📞 Pogingen" value={data.calls_attempted} />
                          <MetricRow label="💬 Gesprekken" value={data.real_conversations} />
                          <MetricRow label="📅 Afspraken" value={data.appointments_set} />
                        </div>
                        <div className="space-y-0.5">
                          <MetricRow label="🔄 Follow-ups" value={data.followups_set} />
                          <MetricRow label="✅ Deals" value={data.deals_closed} />
                          <MetricRow label="⭐ Dagscore" value={data.day_score ? `${data.day_score}/10` : null} />
                          <MetricRow label="⚡ Energie" value={data.energy_score ? `${data.energy_score}/10` : null} />
                        </div>
                      </div>

                      {data.product_lines && data.product_lines.length > 0 && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Productlijnen: </span>
                          <span>{data.product_lines.join(', ')}</span>
                        </div>
                      )}

                      {/* Qualitative */}
                      <div className="space-y-2 text-sm">
                        <TextBlock label="Wat ging goed?" value={data.good_things} />
                        <TextBlock label="Blokkades" value={data.blocker_text} />
                        <TextBlock label="Coaching nodig" value={data.coaching_text} />
                        <TextBlock label="Focus morgen" value={data.focus_tomorrow} />
                        <TextBlock label="Extra notities" value={data.extra_notes} />
                      </div>
                    </>
                  ) : summaryJson ? (
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                      {JSON.stringify(summaryJson, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Geen gedetailleerde data beschikbaar voor deze inzending.</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
