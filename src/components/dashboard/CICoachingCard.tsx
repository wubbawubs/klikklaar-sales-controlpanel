import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, RefreshCw, Phone, GitBranch, Zap, TrendingUp, CalendarClock,
  Sparkles, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Insight {
  title: string;
  observation: string;
  tip: string;
  category: 'calls' | 'pipeline' | 'energie' | 'conversie' | 'planning';
}

interface Props {
  seId: string;
}

const categoryConfig: Record<string, { icon: typeof Phone; color: string; label: string; action: { label: string; link?: string; href?: string } }> = {
  calls: { icon: Phone, color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30', label: 'Bellen', action: { label: 'Ga bellen', link: '/leads' } },
  pipeline: { icon: GitBranch, color: 'text-violet-600 bg-violet-100 dark:text-violet-400 dark:bg-violet-900/30', label: 'Pipeline', action: { label: 'Bekijk leads', link: '/leads' } },
  energie: { icon: Zap, color: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30', label: 'Energie', action: { label: 'Bekijk training', link: '/training' } },
  conversie: { icon: TrendingUp, color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30', label: 'Conversie', action: { label: 'Bekijk leads', link: '/leads' } },
  planning: { icon: CalendarClock, color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30', label: 'Planning', action: { label: 'Bekijk taken', link: '/' } },
};

export default function CICoachingCard({ seId }: Props) {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLeads, setHasLeads] = useState(true);

  const fetchCoaching = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [coachingRes, leadsRes] = await Promise.all([
        supabase.functions.invoke('ci-coaching', {
          body: { sales_executive_id: seId },
        }),
        supabase
          .from('pipedrive_lead_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('sales_executive_id', seId)
          .in('status', ['assigned', 'in_progress']),
      ]);

      if (coachingRes.error) throw coachingRes.error;
      if (coachingRes.data?.error) throw new Error(coachingRes.data.error);

      setInsights(coachingRes.data.insights || []);
      setGeneratedAt(coachingRes.data.generated_at);
      setHasLeads((leadsRes.count ?? 0) > 0);
    } catch (e: any) {
      console.error('Coaching error:', e);
      setError(e.message || 'Kon tips niet laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCoaching();
  }, [seId]);

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-6 flex items-center justify-center gap-3 text-muted-foreground">
          <Brain className="h-5 w-5 animate-pulse" />
          <span className="text-sm">Even je tips ophalen...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="p-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => fetchCoaching(true)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0 && hasLeads) return null;

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/3 via-transparent to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
            </div>
            Persoonlijke tips
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => fetchCoaching(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', refreshing && 'animate-spin')} />
            Vernieuw
          </Button>
        </div>
        {generatedAt && (
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Gebaseerd op je data van de afgelopen 7 dagen
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* No leads CTA */}
        {!hasLeads && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
                <Phone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-foreground">Geen leads beschikbaar</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Je hebt momenteel geen leads om te bellen. Neem contact op met Robin om nieuwe leads toegewezen te krijgen.
                </p>
              </div>
            </div>
            <div className="ml-11">
              <a href="tel:+31617226186">
                <Button size="sm" className="h-8 text-xs">
                  <Phone className="h-3.5 w-3.5 mr-1.5" />
                  Bel Robin (+31 6 17226186)
                </Button>
              </a>
            </div>
          </div>
        )}

        {insights.map((insight, i) => {
          const config = categoryConfig[insight.category] || categoryConfig.calls;
          const Icon = config.icon;

          return (
            <div
              key={i}
              className="rounded-xl border bg-card p-4 space-y-2 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className={cn('p-2 rounded-lg shrink-0', config.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm text-foreground">{insight.title}</h4>
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                      {config.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {insight.observation}
                  </p>
                </div>
              </div>

              <div className="ml-11 p-2.5 rounded-lg bg-primary/5 border border-primary/10 flex items-start justify-between gap-2">
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-semibold text-primary">💡 Tip:</span>{' '}
                  {insight.tip}
                </p>
                {config.action.link && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0 text-primary hover:text-primary"
                    onClick={() => navigate(config.action.link!)}
                  >
                    {config.action.label}
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
