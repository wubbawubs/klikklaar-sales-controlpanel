import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, RefreshCw, Shield } from 'lucide-react';

interface HealthEvent {
  id: string;
  sales_executive_id: string;
  check_type: string;
  status: string;
  error_message: string | null;
  error_code: string | null;
  suggested_fix: string | null;
  notified: boolean;
  created_at: string;
  se_name?: string;
}

const checkTypeLabels: Record<string, string> = {
  supabase_connectivity: 'Database',
  pipedrive_sync_stale: 'Pipedrive Sync',
  ci_engine_down: 'CI Engine',
  edge_functions_down: 'Edge Functions',
};

export default function HealthEventsLog() {
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    setLoading(true);
    // Fetch health events with SE names
    const { data: eventsData } = await supabase
      .from('health_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!eventsData) {
      setEvents([]);
      setLoading(false);
      return;
    }

    // Get unique SE IDs to resolve names
    const seIds = [...new Set(eventsData.map(e => e.sales_executive_id))];
    const { data: seData } = await supabase
      .from('sales_executives')
      .select('id, full_name')
      .in('id', seIds);

    const seMap = new Map((seData || []).map(se => [se.id, se.full_name]));

    setEvents(eventsData.map(e => ({
      ...e,
      se_name: seMap.get(e.sales_executive_id) || 'Systeem',
    })));
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const criticalCount = events.filter(e => e.status === 'critical' || e.status === 'error').length;

  return (
    <div className="bg-card rounded-xl border border-border/60 shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-section text-card-foreground">Health Events Log</h2>
          {criticalCount > 0 && (
            <Badge variant="destructive" className="ml-2">{criticalCount} fout(en)</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchEvents} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Vernieuwen
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="px-6 py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
          <CheckCircle className="h-8 w-8 text-emerald-500" />
          <p>Geen health events geregistreerd — alle systemen operationeel.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tijdstip</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">SE</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Check</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Foutmelding</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Suggestie</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Notificatie</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {format(new Date(event.created_at), 'd MMM HH:mm', { locale: nl })}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{event.se_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {checkTypeLabels[event.check_type] || event.check_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {event.status === 'critical' || event.status === 'error' ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {event.status}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{event.status}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={event.error_message || ''}>
                    {event.error_message || '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={event.suggested_fix || ''}>
                    {event.suggested_fix || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {event.notified ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">Verzonden</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Nee</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
