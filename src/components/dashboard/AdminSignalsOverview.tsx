import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Signal {
  id: string;
  title: string;
  description: string | null;
  action: string | null;
  severity: string;
  confidence: string | null;
  signal_type: string;
  created_at: string;
  sales_executive_id: string;
  se_name?: string;
}

export default function AdminSignalsOverview() {
  const navigate = useNavigate();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: signalsData } = await supabase
        .from('signals')
        .select('*')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!signalsData?.length) { setSignals([]); setLoading(false); return; }

      const seIds = [...new Set(signalsData.map(s => s.sales_executive_id))];
      const { data: seData } = await supabase
        .from('sales_executives')
        .select('id, full_name, first_name, last_name')
        .in('id', seIds);

      const seMap = new Map((seData || []).map(se => [se.id, se.full_name || `${se.first_name} ${se.last_name}`]));

      setSignals(signalsData.map(s => ({ ...s, se_name: seMap.get(s.sales_executive_id) || 'Onbekend' })));
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return null;
  if (signals.length === 0) return null;

  const criticalCount = signals.filter(s => s.severity === 'critical').length;
  const warningCount = signals.filter(s => s.severity === 'warning').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Actieve Signalen
          </CardTitle>
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">{criticalCount} kritiek</Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="text-xs border-warning text-warning">{warningCount} waarschuwing</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {signals.map(sig => (
          <div
            key={sig.id}
            onClick={() => navigate(`/sales-executives/${sig.sales_executive_id}`)}
            className={cn(
              'p-3 rounded-lg border text-sm cursor-pointer transition-colors hover:ring-1 hover:ring-primary/30',
              sig.severity === 'critical' ? 'bg-destructive/5 border-destructive/20' :
              sig.severity === 'warning' ? 'bg-warning/5 border-warning/20' :
              'bg-muted/30 border-border'
            )}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">{sig.title}</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{sig.se_name}</Badge>
                </div>
                {sig.description && <p className="text-muted-foreground text-xs mt-1">{sig.description}</p>}
                {sig.action && <p className="text-primary text-xs mt-1 font-medium">→ {sig.action}</p>}
              </div>
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded uppercase shrink-0',
                sig.severity === 'critical' ? 'bg-destructive/10 text-destructive' :
                sig.severity === 'warning' ? 'bg-warning/10 text-warning' :
                'bg-muted text-muted-foreground'
              )}>
                {sig.severity}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
