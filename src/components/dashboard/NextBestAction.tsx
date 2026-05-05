import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PhoneForwarded, Target, Phone, Zap, ArrowRight,
  Lightbulb, TrendingUp, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NextAction {
  type: 'overdue_callbacks' | 'untouched_leads' | 'low_activity' | 'follow_up_interest';
  icon: typeof Phone;
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  link: string;
  linkLabel: string;
  count?: number;
}

interface SecondaryAdvice {
  icon: typeof Lightbulb;
  label: string;
  text: string;
  variant: 'behavior' | 'insight';
}

interface Props {
  seId: string;
}

export default function NextBestAction({ seId }: Props) {
  const [action, setAction] = useState<NextAction | null>(null);
  const [secondaryAdvice, setSecondaryAdvice] = useState<SecondaryAdvice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const analyze = async () => {
      const today = new Date().toISOString().split('T')[0];

      const [callbacksRes, leadsRes, todayCallsRes, weekCallsRes] = await Promise.all([
        supabase
          .from('calls')
          .select('id, contact_name, org_name, callback_date')
          .eq('sales_executive_id', seId)
          .eq('outcome', 'callback')
          .lt('callback_date', today)
          .not('callback_date', 'is', null),
        supabase
          .from('lead_assignments')
          .select('id, org_name, person_name, created_at')
          .eq('sales_executive_id', seId)
          .in('status', ['assigned']),
        supabase
          .from('calls')
          .select('id, outcome')
          .eq('sales_executive_id', seId)
          .gte('created_at', `${today}T00:00:00`),
        // Last 7 days calls for insights
        supabase
          .from('calls')
          .select('id, outcome, created_at')
          .eq('sales_executive_id', seId)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const overdueCallbacks = callbacksRes.data || [];
      const untouchedLeads = leadsRes.data || [];
      const todayCalls = todayCallsRes.data || [];
      const weekCalls = weekCallsRes.data || [];

      const { data: interestCalls } = await supabase
        .from('calls')
        .select('id, contact_name, org_name, created_at')
        .eq('sales_executive_id', seId)
        .eq('outcome', 'interest')
        .order('created_at', { ascending: false })
        .limit(10);

      const interestFollowUps = (interestCalls || []).filter(c => {
        const daysSince = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince >= 2;
      });

      // Primary action selection (same priority logic)
      let bestAction: NextAction | null = null;

      if (overdueCallbacks.length > 0) {
        bestAction = {
          type: 'overdue_callbacks',
          icon: PhoneForwarded,
          title: `${overdueCallbacks.length} achterstallige callback${overdueCallbacks.length > 1 ? 's' : ''}`,
          description: overdueCallbacks.length === 1
            ? `Bel ${overdueCallbacks[0].contact_name || overdueCallbacks[0].org_name || 'contact'} terug, callback stond gepland vóór vandaag.`
            : `Je hebt ${overdueCallbacks.length} callbacks die al voorbij de geplande datum zijn. Begin met de oudste.`,
          confidence: 'high',
          link: '/calls',
          linkLabel: 'Ga naar Call Logging',
          count: overdueCallbacks.length,
        };
      } else if (interestFollowUps.length > 0) {
        bestAction = {
          type: 'follow_up_interest',
          icon: Target,
          title: `${interestFollowUps.length} warme lead${interestFollowUps.length > 1 ? 's' : ''} wacht${interestFollowUps.length === 1 ? '' : 'en'} op opvolging`,
          description: interestFollowUps.length === 1
            ? `${interestFollowUps[0].contact_name || interestFollowUps[0].org_name || 'Contact'} toonde interesse maar is nog niet opgevolgd. Neem vandaag contact op.`
            : `${interestFollowUps.length} contacten toonden interesse maar zijn al 2+ dagen niet opgevolgd.`,
          confidence: 'high',
          link: '/leads',
          linkLabel: 'Bekijk leads',
          count: interestFollowUps.length,
        };
      } else if (untouchedLeads.length > 0) {
        bestAction = {
          type: 'untouched_leads',
          icon: Target,
          title: `${untouchedLeads.length} ongebelde lead${untouchedLeads.length > 1 ? 's' : ''}`,
          description: untouchedLeads.length === 1
            ? `${untouchedLeads[0].org_name || untouchedLeads[0].person_name || 'Lead'} is toegewezen maar nog niet gebeld.`
            : `Je hebt ${untouchedLeads.length} leads die nog geen enkel belmoment hebben gehad.`,
          confidence: 'medium',
          link: '/leads',
          linkLabel: 'Bekijk leads',
          count: untouchedLeads.length,
        };
      } else if (todayCalls.length === 0) {
        bestAction = {
          type: 'low_activity',
          icon: Phone,
          title: 'Nog geen calls vandaag',
          description: 'Begin je dag met de eerste belsessie. Focus op je open leads of geplande callbacks.',
          confidence: 'low',
          link: '/calls',
          linkLabel: 'Start met bellen',
        };
      }

      // === Secondary advice generation ===
      const advice: SecondaryAdvice[] = [];

      // Behavioral suggestion based on call patterns
      const weekInterest = weekCalls.filter(c => c.outcome === 'interest').length;
      const weekNotReached = weekCalls.filter(c => c.outcome === 'not_reached').length;
      const weekAppointments = weekCalls.filter(c => c.outcome === 'appointment').length;
      const weekTotal = weekCalls.length;

      if (weekTotal > 0 && weekNotReached / weekTotal > 0.6) {
        advice.push({
          icon: Lightbulb,
          label: 'Gedragstip',
          text: 'Meer dan 60% van je calls bereikt niemand. Probeer op andere tijdstippen te bellen — ochtend (9-10u) en late namiddag (16-17u) scoren vaak beter.',
          variant: 'behavior',
        });
      } else if (weekTotal > 5 && weekAppointments === 0) {
        advice.push({
          icon: Lightbulb,
          label: 'Gedragstip',
          text: 'Je hebt deze week nog geen afspraken ingepland. Focus op het concreet voorstellen van een datum en tijdstip tijdens je gesprekken.',
          variant: 'behavior',
        });
      } else if (weekInterest > 0 && weekAppointments === 0) {
        advice.push({
          icon: Lightbulb,
          label: 'Gedragstip',
          text: `Je hebt ${weekInterest} keer interesse genoteerd maar nog geen afspraak. Probeer sneller door te pakken met een concreet voorstel.`,
          variant: 'behavior',
        });
      } else {
        advice.push({
          icon: Lightbulb,
          label: 'Gedragstip',
          text: 'Zet na elke call direct de volgende stap klaar: plan een callback, noteer een actiepunt of update de leadstatus.',
          variant: 'behavior',
        });
      }

      // Data insight based on weekly performance
      const conversionRate = weekTotal > 0 ? Math.round(((weekInterest + weekAppointments) / weekTotal) * 100) : 0;
      const avgCallsPerDay = weekTotal > 0 ? Math.round(weekTotal / 7 * 10) / 10 : 0;

      if (weekTotal === 0) {
        advice.push({
          icon: BarChart3,
          label: 'Inzicht',
          text: 'Er zijn nog geen calls deze week. Na een paar belsessies verschijnen hier patronen en conversiecijfers.',
          variant: 'insight',
        });
      } else if (conversionRate >= 30) {
        advice.push({
          icon: TrendingUp,
          label: 'Inzicht',
          text: `Sterke week: ${conversionRate}% van je calls leidt tot interesse of afspraak. Je gemiddelde is ${avgCallsPerDay} calls/dag.`,
          variant: 'insight',
        });
      } else {
        advice.push({
          icon: BarChart3,
          label: 'Inzicht',
          text: `Deze week: ${weekTotal} calls, ${conversionRate}% conversie naar interesse/afspraak. Gem. ${avgCallsPerDay} calls/dag.`,
          variant: 'insight',
        });
      }

      setAction(bestAction);
      setSecondaryAdvice(advice);
      setLoading(false);
    };

    analyze();
  }, [seId]);

  if (loading || (!action && secondaryAdvice.length === 0)) return null;

  const confidenceColors = {
    high: 'bg-success/10 text-success border-success/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-muted text-muted-foreground border-border',
  };

  const adviceColors = {
    behavior: 'border-accent/30 bg-accent/[0.04]',
    insight: 'border-muted-foreground/20 bg-muted/30',
  };

  return (
    <div className="space-y-3">
      {/* Primary Next Best Action */}
      {action && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                <action.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Volgende stap</span>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', confidenceColors[action.confidence])}>
                    {action.confidence === 'high' ? 'Hoge' : action.confidence === 'medium' ? 'Gemiddelde' : 'Lage'} prioriteit
                  </Badge>
                </div>
                <p className="font-semibold text-foreground text-sm">{action.title}</p>
                <p className="text-muted-foreground text-xs mt-1">{action.description}</p>
                <Link to={action.link}>
                  <Button size="sm" className="mt-3 h-8 text-xs">
                    {action.linkLabel}
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Secondary Advice Row */}
      {secondaryAdvice.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {secondaryAdvice.map((adv, i) => {
            const AdvIcon = adv.icon;
            return (
              <Card key={i} className={cn('border', adviceColors[adv.variant])}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2.5">
                    <AdvIcon className={cn(
                      'h-4 w-4 mt-0.5 shrink-0',
                      adv.variant === 'behavior' ? 'text-accent-foreground' : 'text-muted-foreground'
                    )} />
                    <div className="min-w-0">
                      <span className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider',
                        adv.variant === 'behavior' ? 'text-accent-foreground' : 'text-muted-foreground'
                      )}>
                        {adv.label}
                      </span>
                      <p className="text-xs text-foreground mt-0.5 leading-relaxed">{adv.text}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
