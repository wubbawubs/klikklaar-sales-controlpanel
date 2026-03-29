import { useEffect, useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { RefreshCw, User, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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

interface PipelineData {
  pipeline: { id: number; name: string };
  stages: Stage[];
  total_deals: number;
  total_value: number;
  fetched_at: string;
}

export function PipedriveFunnel({ pipedriveUserId }: { pipedriveUserId?: number }) {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchDeals = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = pipedriveUserId ? { user_id: String(pipedriveUserId) } : {};
      const queryString = new URLSearchParams(params).toString();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-deals${queryString ? `?${queryString}` : ''}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const result = await res.json();
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

  useEffect(() => { fetchDeals(); }, [pipedriveUserId]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
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

  if (!data?.stages?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Geen stages gevonden.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">{data.pipeline.name}</h3>
          <StatusBadge status="connected" />
          <Badge variant="secondary" className="text-xs">
            {data.total_deals} deals
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatCurrency(data.total_value)} totaal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {new Date(data.fetched_at).toLocaleString('nl-NL')}
          </span>
          <Button variant="outline" size="sm" onClick={fetchDeals} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            Vernieuwen
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll('left')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll('right')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {data.stages.map((stage) => (
          <StageColumn key={stage.id} stage={stage} formatCurrency={formatCurrency} />
        ))}
      </div>
    </div>
  );
}

function StageColumn({ stage, formatCurrency }: { stage: Stage; formatCurrency: (v: number) => string }) {
  return (
    <div
      className="flex-shrink-0 w-[240px] flex flex-col rounded-lg border bg-muted/30"
      style={{ scrollSnapAlign: 'start' }}
    >
      {/* Column header */}
      <div className="px-3 py-2 border-b bg-muted/50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium truncate">{stage.name}</h4>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1 shrink-0">
            {stage.deals_count}
          </Badge>
        </div>
        {stage.deals_value > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatCurrency(stage.deals_value)}
          </p>
        )}
      </div>

      {/* Deal cards */}
      <ScrollArea className="flex-1 max-h-[calc(100vh-280px)]">
        <div className="p-2 space-y-2">
          {stage.deals.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Geen deals</p>
          ) : (
            stage.deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} formatCurrency={formatCurrency} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DealCard({ deal, formatCurrency }: { deal: Deal; formatCurrency: (v: number) => string }) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow cursor-default">
      <CardContent className="p-2.5 space-y-1.5">
        <p className="text-sm font-medium leading-tight line-clamp-2">{deal.title}</p>

        {deal.org_name && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.org_name}</span>
          </div>
        )}

        {deal.person_name && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{deal.person_name}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-xs font-semibold text-primary">
            {formatCurrency(deal.value)}
          </span>
          {deal.owner_name && (
            <span className="text-[10px] text-muted-foreground">{deal.owner_name}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
