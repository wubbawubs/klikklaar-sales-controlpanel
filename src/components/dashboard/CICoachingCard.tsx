import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, RefreshCw, Phone, GitBranch, Zap, TrendingUp, CalendarClock,
  Sparkles,
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

const categoryConfig: Record<string, { icon: typeof Phone; color: string; label: string }> = {
  calls: { icon: Phone, color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30', label: 'Calls' },
  pipeline: { icon: GitBranch, color: 'text-violet-600 bg-violet-100 dark:text-violet-400 dark:bg-violet-900/30', label: 'Pipeline' },
  energie: { icon: Zap, color: 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30', label: 'Energie' },
  conversie: { icon: TrendingUp, color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30', label: 'Conversie' },
  planning: { icon: CalendarClock, color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30', label: 'Planning' },
};

export default function CICoachingCard({ seId }: Props) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCoaching = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ci-coaching', {
        body: { sales_executive_id: seId },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setInsights(data.insights || []);
      setGeneratedAt(data.generated_at);
    } catch (e: any) {
      console.error('CI coaching error:', e);
      setError(e.message || 'Kon coaching niet laden');
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
          <span className="text-sm">CI Engine analyseert je data...</span>
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

  if (insights.length === 0) return null;

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-primary/3 via-transparent to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
            </div>
            CI Engine — Coaching
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

              <div className="ml-11 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-semibold text-primary">💡 Tip:</span>{' '}
                  {insight.tip}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
