import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle, AlertCircle, Phone, Target, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SELeadHealth {
  se_id: string;
  se_name: string;
  assigned: number;
  contacted: number;
  uncalled: number;
  total: number;
  lastCallDate: string | null;
  callbacksOverdue: number;
  health: 'green' | 'yellow' | 'red';
  healthReason: string;
}

export default function LeadHealthOverview() {
  const [data, setData] = useState<SELeadHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    const today = new Date().toISOString().split('T')[0];

    const [
      { data: sesData },
      { data: leadsData },
      { data: callsData },
    ] = await Promise.all([
      supabase.from('sales_executives').select('id, full_name, status').eq('status', 'active'),
      supabase.from('pipedrive_lead_assignments').select('sales_executive_id, status'),
      supabase.from('calls').select('sales_executive_id, created_at, outcome, callback_date'),
    ]);

    const seList = sesData || [];
    const leads = leadsData || [];
    const calls = callsData || [];

    const healthData: SELeadHealth[] = seList.map(se => {
      const seLeads = leads.filter(l => l.sales_executive_id === se.id);
      const seCalls = calls.filter(c => c.sales_executive_id === se.id);

      const assigned = seLeads.filter(l => l.status === 'assigned').length;
      const contacted = seLeads.filter(l => ['contacted', 'qualified'].includes(l.status)).length;
      const total = seLeads.length;
      const uncalled = assigned; // assigned = not yet called

      // Last call
      const sortedCalls = seCalls
        .map(c => c.created_at)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const lastCallDate = sortedCalls[0] || null;

      // Overdue callbacks
      const callbacksOverdue = seCalls.filter(
        c => c.outcome === 'callback' && c.callback_date && c.callback_date <= today
      ).length;

      // Determine health
      let health: 'green' | 'yellow' | 'red' = 'green';
      let healthReason = 'Voldoende leads';

      if (uncalled === 0 && total === 0) {
        health = 'red';
        healthReason = 'Geen leads toegewezen';
      } else if (uncalled <= 3) {
        health = 'red';
        healthReason = `Nog maar ${uncalled} ongebelde leads`;
      } else if (uncalled <= 10) {
        health = 'yellow';
        healthReason = `${uncalled} ongebelde leads over`;
      }

      // Check last call recency
      if (lastCallDate) {
        const daysSinceCall = Math.floor(
          (Date.now() - new Date(lastCallDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceCall >= 3) {
          health = 'red';
          healthReason = `${daysSinceCall} dagen geen call gelogd`;
        } else if (daysSinceCall >= 2 && health !== 'red') {
          health = 'yellow';
          healthReason = `${daysSinceCall} dagen geen call gelogd`;
        }
      } else if (total > 0) {
        health = 'red';
        healthReason = 'Nog nooit gebeld';
      }

      if (callbacksOverdue > 0 && health !== 'red') {
        health = 'yellow';
        healthReason = `${callbacksOverdue} verlopen callbacks`;
      }

      return {
        se_id: se.id,
        se_name: se.full_name || 'Onbekend',
        assigned,
        contacted,
        uncalled,
        total,
        lastCallDate,
        callbacksOverdue,
        health,
        healthReason,
      };
    });

    // Sort: red first, then yellow, then green
    const order = { red: 0, yellow: 1, green: 2 };
    healthData.sort((a, b) => order[a.health] - order[b.health]);

    setData(healthData);
    setLoading(false);
  };

  const healthColors = {
    red: 'bg-destructive/10 text-destructive border-destructive/20',
    yellow: 'bg-warning/10 text-warning border-warning/20',
    green: 'bg-success/10 text-success border-success/20',
  };

  const healthIcons = {
    red: AlertTriangle,
    yellow: AlertCircle,
    green: CheckCircle,
  };

  const redCount = data.filter(d => d.health === 'red').length;
  const yellowCount = data.filter(d => d.health === 'yellow').length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Lead Health Monitor
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time overzicht van lead-voorraad per Sales Executive
            </p>
          </div>
          <div className="flex items-center gap-2">
            {redCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {redCount} kritiek
              </Badge>
            )}
            {yellowCount > 0 && (
              <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">
                {yellowCount} let op
              </Badge>
            )}
            <Link to="/leads">
              <Button variant="outline" size="sm">Leads beheren</Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Geen actieve sales executives</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.map(se => {
              const HealthIcon = healthIcons[se.health];
              return (
                <Link
                  key={se.se_id}
                  to={`/sales-executives/${se.se_id}`}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border transition-all hover:shadow-md hover:scale-[1.01]',
                    healthColors[se.health]
                  )}
                >
                  <HealthIcon className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{se.se_name}</span>
                    </div>
                    <p className="text-xs mt-1 font-medium">{se.healthReason}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {se.uncalled} ongebeld
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {se.contacted} gecontacteerd
                      </span>
                      {se.callbacksOverdue > 0 && (
                        <span className="flex items-center gap-1 text-warning font-medium">
                          ⏰ {se.callbacksOverdue} callbacks
                        </span>
                      )}
                    </div>
                    {se.lastCallDate && (
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Laatste call: {new Date(se.lastCallDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
