import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingUp, Users, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Deal {
  id: number;
  title: string;
  value: number;
  currency: string;
  person_name: string | null;
  org_name: string | null;
  owner_name: string | null;
  expected_close_date: string | null;
}

interface Stage {
  id: number;
  name: string;
  order: number;
  deals_count: number;
  deals_value: number;
  deals: Deal[];
}

interface Pipeline {
  id: number;
  name: string;
  active: boolean;
  stages: Stage[];
  total_deals: number;
  total_value: number;
}

interface FunnelData {
  funnels: Pipeline[];
  fetched_at: string;
}

export function PipedriveFunnel() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  const fetchDeals = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('pipedrive-deals');
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (err: any) {
      const msg = err?.message || 'Kon Pipedrive data niet ophalen';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeals(); }, []);

  const formatCurrency = (value: number, currency = 'EUR') => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground text-sm">Pipedrive data ophalen…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchDeals}>
            <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data?.funnels?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Geen pipelines gevonden in Pipedrive.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge status="connected" />
          {data.fetched_at && (
            <span className="text-xs text-muted-foreground">
              Laatst opgehaald: {new Date(data.fetched_at).toLocaleString('nl-NL')}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchDeals} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Vernieuwen
        </Button>
      </div>

      {data.funnels.length === 1 ? (
        <PipelineView pipeline={data.funnels[0]} expandedStage={expandedStage} setExpandedStage={setExpandedStage} formatCurrency={formatCurrency} />
      ) : (
        <Tabs defaultValue={String(data.funnels[0].id)}>
          <TabsList>
            {data.funnels.map(p => (
              <TabsTrigger key={p.id} value={String(p.id)}>{p.name}</TabsTrigger>
            ))}
          </TabsList>
          {data.funnels.map(p => (
            <TabsContent key={p.id} value={String(p.id)}>
              <PipelineView pipeline={p} expandedStage={expandedStage} setExpandedStage={setExpandedStage} formatCurrency={formatCurrency} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function PipelineView({ pipeline, expandedStage, setExpandedStage, formatCurrency }: {
  pipeline: Pipeline;
  expandedStage: number | null;
  setExpandedStage: (id: number | null) => void;
  formatCurrency: (v: number, c?: string) => string;
}) {
  const maxDeals = Math.max(...pipeline.stages.map(s => s.deals_count), 1);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Stages</p>
              <p className="text-lg font-bold">{pipeline.stages.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open deals</p>
              <p className="text-lg font-bold">{pipeline.total_deals}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pipeline waarde</p>
              <p className="text-lg font-bold">{formatCurrency(pipeline.total_value)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel visualization */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{pipeline.name} — Deal Funnel</CardTitle>
          <CardDescription>Klik op een stage om de deals te bekijken</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pipeline.stages.map((stage, i) => {
            const widthPct = Math.max(20, (stage.deals_count / maxDeals) * 100);
            const isExpanded = expandedStage === stage.id;

            return (
              <div key={stage.id}>
                <button
                  onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div
                        className={cn(
                          "relative h-10 rounded-md flex items-center px-3 transition-all",
                          "bg-primary/15 hover:bg-primary/25 border border-primary/20",
                        )}
                        style={{ width: `${widthPct}%` }}
                      >
                        <span className="text-sm font-medium truncate">{stage.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-40 justify-end">
                      <Badge variant="secondary" className="text-xs">
                        {stage.deals_count} deal{stage.deals_count !== 1 ? 's' : ''}
                      </Badge>
                      <span className="text-xs text-muted-foreground w-20 text-right">
                        {formatCurrency(stage.deals_value)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && stage.deals.length > 0 && (
                  <div className="mt-2 ml-4 mb-3 border-l-2 border-primary/20 pl-4 space-y-2">
                    {stage.deals.map(deal => (
                      <div key={deal.id} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{deal.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[deal.person_name, deal.org_name].filter(Boolean).join(' — ') || 'Geen contactpersoon'}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="font-medium">{formatCurrency(deal.value, deal.currency)}</p>
                          {deal.expected_close_date && (
                            <p className="text-xs text-muted-foreground">Sluitdatum: {deal.expected_close_date}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
