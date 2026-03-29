import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PhoneForwarded, Target, Phone, Zap, ArrowRight,
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

interface Props {
  seId: string;
}

export default function NextBestAction({ seId }: Props) {
  const [action, setAction] = useState<NextAction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const analyze = async () => {
      const today = new Date().toISOString().split('T')[0];

      const [callbacksRes, leadsRes, todayCallsRes] = await Promise.all([
        // Overdue callbacks: callback_date < today
        supabase
          .from('calls')
          .select('id, contact_name, org_name, callback_date')
          .eq('sales_executive_id', seId)
          .eq('outcome', 'callback')
          .lt('callback_date', today)
          .not('callback_date', 'is', null),
        // Untouched leads: assigned but no calls logged
        supabase
          .from('pipedrive_lead_assignments')
          .select('id, org_name, person_name, created_at')
          .eq('sales_executive_id', seId)
          .in('status', ['assigned']),
        // Today's calls for activity check
        supabase
          .from('calls')
          .select('id, outcome')
          .eq('sales_executive_id', seId)
          .gte('created_at', `${today}T00:00:00`),
      ]);

      const overdueCallbacks = callbacksRes.data || [];
      const untouchedLeads = leadsRes.data || [];
      const todayCalls = todayCallsRes.data || [];

      // Also check for interest follow-ups (calls with interest but no further activity)
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

      // Priority-based action selection
      let bestAction: NextAction | null = null;

      // Priority 1: Overdue callbacks (highest urgency)
      if (overdueCallbacks.length > 0) {
        bestAction = {
          type: 'overdue_callbacks',
          icon: PhoneForwarded,
          title: `${overdueCallbacks.length} achterstallige callback${overdueCallbacks.length > 1 ? 's' : ''}`,
          description: overdueCallbacks.length === 1
            ? `Bel ${overdueCallbacks[0].contact_name || overdueCallbacks[0].org_name || 'contact'} terug — callback stond gepland vóór vandaag.`
            : `Je hebt ${overdueCallbacks.length} callbacks die al voorbij de geplande datum zijn. Begin met de oudste.`,
          confidence: 'high',
          link: '/calls',
          linkLabel: 'Ga naar Call Logging',
          count: overdueCallbacks.length,
        };
      }
      // Priority 2: Interest follow-ups (warm leads getting cold)
      else if (interestFollowUps.length > 0) {
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
      }
      // Priority 3: Untouched leads
      else if (untouchedLeads.length > 0) {
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
      }
      // Priority 4: Low activity today
      else if (todayCalls.length === 0) {
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

      setAction(bestAction);
      setLoading(false);
    };

    analyze();
  }, [seId]);

  if (loading || !action) return null;

  const Icon = action.icon;
  const confidenceColors = {
    high: 'bg-success/10 text-success border-success/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Next Best Action</span>
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
  );
}
