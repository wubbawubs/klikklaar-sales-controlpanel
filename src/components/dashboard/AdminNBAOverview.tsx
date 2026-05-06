import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Zap, PhoneForwarded, Target, Phone, Lightbulb, TrendingUp, BarChart3, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SEAction {
  seId: string;
  seName: string;
  primary: {
    type: string;
    title: string;
    confidence: 'high' | 'medium' | 'low';
    icon: typeof Phone;
  } | null;
  behavior: string;
  insight: string;
}

export default function AdminNBAOverview() {
  const [seActions, setSeActions] = useState<SEAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const analyze = async () => {
      const { data: seData } = await supabase
        .from('sales_executives')
        .select('id, full_name, first_name, last_name')
        .eq('status', 'active');

      if (!seData?.length) { setLoading(false); return; }

      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [callbacksRes, leadsRes, weekCallsRes] = await Promise.all([
        supabase
          .from('calls')
          .select('id, sales_executive_id, callback_date')
          .eq('outcome', 'callback')
          .lt('callback_date', today)
          .not('callback_date', 'is', null),
        supabase
          .from('lead_assignments')
          .select('id, sales_executive_id')
          .in('status', ['assigned']),
        supabase
          .from('calls')
          .select('id, sales_executive_id, outcome, created_at')
          .gte('created_at', weekAgo),
      ]);

      const callbacks = callbacksRes.data || [];
      const leads = leadsRes.data || [];
      const weekCalls = weekCallsRes.data || [];

      const actions: SEAction[] = seData.map(se => {
        const seName = se.full_name || `${se.first_name} ${se.last_name}`;
        const seCallbacks = callbacks.filter(c => c.sales_executive_id === se.id);
        const seLeads = leads.filter(l => l.sales_executive_id === se.id);
        const seCalls = weekCalls.filter(c => c.sales_executive_id === se.id);

        // Primary action
        let primary: SEAction['primary'] = null;
        if (seCallbacks.length > 0) {
          primary = {
            type: 'overdue_callbacks',
            title: `${seCallbacks.length} achterstallige callback${seCallbacks.length > 1 ? 's' : ''}`,
            confidence: 'high',
            icon: PhoneForwarded,
          };
        } else if (seLeads.length > 0) {
          primary = {
            type: 'untouched_leads',
            title: `${seLeads.length} ongebelde lead${seLeads.length > 1 ? 's' : ''}`,
            confidence: 'medium',
            icon: Target,
          };
        }

        // Behavior tip
        const notReached = seCalls.filter(c => c.outcome === 'not_reached').length;
        const appointments = seCalls.filter(c => c.outcome === 'appointment').length;
        const interest = seCalls.filter(c => c.outcome === 'interest').length;
        const total = seCalls.length;

        let behavior = 'Na elke call de volgende stap klaar zetten.';
        if (total > 0 && notReached / total > 0.6) {
          behavior = '>60% niet bereikt — andere beltijden adviseren.';
        } else if (total > 5 && appointments === 0) {
          behavior = 'Nog geen afspraken deze week — focus op concreet voorstel.';
        } else if (interest > 0 && appointments === 0) {
          behavior = `${interest}x interesse, geen afspraak — sneller doorpakken.`;
        }

        // Insight
        const convRate = total > 0 ? Math.round(((interest + appointments) / total) * 100) : 0;
        const avgPerDay = total > 0 ? Math.round(total / 7 * 10) / 10 : 0;
        const insight = total > 0
          ? `${total} calls, ${convRate}% conversie, ${avgPerDay}/dag`
          : 'Geen calls deze week';

        return { seId: se.id, seName, primary, behavior, insight };
      });

      // Sort: SEs with high-priority actions first
      actions.sort((a, b) => {
        const prio = (s: SEAction) => s.primary?.confidence === 'high' ? 0 : s.primary ? 1 : 2;
        return prio(a) - prio(b);
      });

      setSeActions(actions);
      setLoading(false);
    };
    analyze();
  }, []);

  if (loading || seActions.length === 0) return null;

  const confidenceColors = {
    high: 'bg-success/10 text-success border-success/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Next Best Actions — Per SE
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {seActions.map(se => (
          <Link
            key={se.seId}
            to={`/sales-executives/${se.seId}`}
            className="block p-3 rounded-lg border bg-card hover:ring-1 hover:ring-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-semibold text-sm text-foreground">{se.seName}</span>
                  {se.primary && (
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', confidenceColors[se.primary.confidence])}>
                      {se.primary.confidence === 'high' ? 'Hoge' : 'Gemiddelde'} prioriteit
                    </Badge>
                  )}
                </div>

                {/* Primary action */}
                {se.primary && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <se.primary.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-xs font-medium text-foreground">{se.primary.title}</span>
                  </div>
                )}

                {/* Secondary advice row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-start gap-1.5">
                    <Lightbulb className="h-3 w-3 text-accent-foreground mt-0.5 shrink-0" />
                    <span className="text-[11px] text-muted-foreground leading-tight">{se.behavior}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <BarChart3 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-[11px] text-muted-foreground leading-tight">{se.insight}</span>
                  </div>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
