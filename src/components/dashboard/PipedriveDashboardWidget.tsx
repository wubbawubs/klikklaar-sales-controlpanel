import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Building2, RefreshCw, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  seId: string;
}

interface DealSummary {
  stageName: string;
  count: number;
  value: number;
}

export default function PipedriveDashboardWidget({ seId }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DealSummary[]>([]);
  const [totalDeals, setTotalDeals] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [leadCount, setLeadCount] = useState(0);

  useEffect(() => {
    loadData();
  }, [seId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get assigned leads
      const { data: leads } = await (supabase as any)
        .from('pipedrive_lead_assignments')
        .select('pipedrive_org_id')
        .eq('sales_executive_id', seId);

      const orgIds = [...new Set((leads || []).map((l: any) => l.pipedrive_org_id).filter(Boolean))];
      setLeadCount(leads?.length || 0);

      if (orgIds.length > 0) {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-deals?org_ids=${orgIds.join(',')}`,
          { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const result = await res.json();
        const stages = (result.stages || []).filter((s: any) => s.deals_count > 0);
        setSummary(stages.map((s: any) => ({ stageName: s.name, count: s.deals_count, value: s.deals_value })));
        setTotalDeals(result.total_deals || 0);
        setTotalValue(result.total_value || 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Pipeline laden...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Pipedrive Overzicht
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {totalDeals} deals · {formatCurrency(totalValue)}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => navigate('/pipedrive')}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Bekijk alles
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {summary.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Geen actieve deals gevonden. {leadCount === 0 ? 'Er zijn nog geen leads toegewezen.' : ''}
          </p>
        ) : (
          <div className="space-y-2">
            {summary.map((s) => (
              <div key={s.stageName} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-sm font-medium">{s.stageName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{s.count} deal{s.count !== 1 ? 's' : ''}</Badge>
                  <span className="text-xs font-medium text-primary">{formatCurrency(s.value)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
