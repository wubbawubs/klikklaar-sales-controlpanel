import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhoneForwarded, Target, TrendingUp, ClipboardList, Phone, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadDetailSheet } from '@/components/leads/LeadDetailSheet';

interface TaskItem {
  id: string;
  icon: typeof Phone;
  label: string;
  sublabel?: string;
  priority: 'high' | 'medium' | 'low';
  orgId?: number | null;
  personId?: number | null;
  dealTitle?: string | null;
  leadAssignmentId?: string | null;
  orgName?: string | null;
  personName?: string | null;
  personPhone?: string | null;
}

interface Props {
  seId: string;
}

export default function SETaskChecklist({ seId }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const displayTasks = tasks.slice(0, 8);
  const selectedTask = selectedIdx !== null ? displayTasks[selectedIdx] ?? null : null;

  const fetchTasks = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const [callbacksRes, leadsRes, interestRes, allCallsRes] = await Promise.all([
      // Callbacks with lead assignment data
      supabase
        .from('calls')
        .select('id, contact_name, org_name, callback_date, lead_assignment_id, created_at')
        .eq('sales_executive_id', seId)
        .eq('outcome', 'callback')
        .lte('callback_date', today)
        .not('callback_date', 'is', null)
        .order('callback_date', { ascending: true }),
      // Untouched leads (only 'assigned' status)
      supabase
        .from('lead_assignments')
        .select('id, org_name, person_name, person_phone, deal_title')
        .eq('sales_executive_id', seId)
        .in('status', ['assigned'])
        .order('created_at', { ascending: true }),
      // Interest follow-ups
      supabase
        .from('calls')
        .select('id, contact_name, org_name, created_at, lead_assignment_id')
        .eq('sales_executive_id', seId)
        .eq('outcome', 'interest')
        .order('created_at', { ascending: false })
        .limit(10),
      // All calls for this SE today + recent — to check follow-ups
      supabase
        .from('calls')
        .select('id, lead_assignment_id, created_at, outcome')
        .eq('sales_executive_id', seId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    // Build a map: lead_assignment_id → most recent call
    const latestCallByLead = new Map<string, { created_at: string; outcome: string }>();
    (allCallsRes.data || []).forEach(c => {
      if (!c.lead_assignment_id) return;
      const existing = latestCallByLead.get(c.lead_assignment_id);
      if (!existing || c.created_at > existing.created_at) {
        latestCallByLead.set(c.lead_assignment_id, { created_at: c.created_at, outcome: c.outcome });
      }
    });

    // Collect lead_assignment_ids for enrichment
    const assignmentIds = [
      ...(callbacksRes.data || []).map(c => c.lead_assignment_id).filter(Boolean),
      ...(interestRes.data || []).map(c => c.lead_assignment_id).filter(Boolean),
    ];

    let assignmentMap: Record<string, { deal_title: string | null; id: string; org_name: string | null; person_name: string | null; person_phone: string | null }> = {};
    if (assignmentIds.length > 0) {
      const { data: assignments } = await supabase
        .from('lead_assignments')
        .select('id, deal_title, org_name, person_name, person_phone')
        .in('id', assignmentIds);
      (assignments || []).forEach(a => {
        assignmentMap[a.id] = a;
      });
    }

    const items: TaskItem[] = [];

    // Overdue callbacks — but only if no follow-up call was made AFTER the callback
    (callbacksRes.data || []).forEach(cb => {
      // Check if there's a newer call for this lead after this callback was created
      if (cb.lead_assignment_id) {
        const latestCall = latestCallByLead.get(cb.lead_assignment_id);
        if (latestCall && latestCall.created_at > cb.created_at && latestCall.outcome !== 'callback') {
          return; // Already followed up — skip this task
        }
      }

      const isOverdue = cb.callback_date! < today;
      const assignment = cb.lead_assignment_id ? assignmentMap[cb.lead_assignment_id] : null;
      items.push({
        id: `cb-${cb.id}`,
        icon: PhoneForwarded,
        label: `Bel terug: ${cb.contact_name || cb.org_name || 'Contact'}`,
        sublabel: isOverdue ? `Gepland: ${cb.callback_date}` : 'Vandaag',
        priority: 'high',
        orgId: null,
        personId: null,
        dealTitle: assignment?.deal_title ?? null,
        leadAssignmentId: cb.lead_assignment_id ?? null,
        orgName: cb.org_name ?? assignment?.org_name ?? null,
        personName: cb.contact_name ?? assignment?.person_name ?? null,
        personPhone: assignment?.person_phone ?? null,
      });
    });

    // Interest follow-ups older than 2 days — but only if not already followed up
    (interestRes.data || []).filter(c => {
      const daysSince = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince < 2) return false;
      // Check if there's a newer call after this interest call
      if (c.lead_assignment_id) {
        const latestCall = latestCallByLead.get(c.lead_assignment_id);
        if (latestCall && latestCall.created_at > c.created_at) {
          return false; // Already followed up
        }
      }
      return true;
    }).forEach(c => {
      const assignment = c.lead_assignment_id ? assignmentMap[c.lead_assignment_id] : null;
      items.push({
        id: `fu-${c.id}`,
        icon: TrendingUp,
        label: `Opvolgen: ${c.contact_name || c.org_name || 'Contact'}`,
        sublabel: 'Toonde interesse, nog niet opgevolgd',
        priority: 'high',
        orgId: null,
        personId: null,
        dealTitle: assignment?.deal_title ?? null,
        leadAssignmentId: c.lead_assignment_id ?? null,
        orgName: c.org_name ?? assignment?.org_name ?? null,
        personName: c.contact_name ?? assignment?.person_name ?? null,
        personPhone: assignment?.person_phone ?? null,
      });
    });

    // Untouched leads — medium priority
    (leadsRes.data || []).forEach(lead => {
      items.push({
        id: `lead-${lead.id}`,
        icon: Target,
        label: `Bel: ${lead.org_name || lead.person_name || 'Nieuwe lead'}`,
        sublabel: lead.deal_title || 'Nog niet gebeld',
        priority: 'medium',
        orgId: null,
        personId: null,
        dealTitle: lead.deal_title ?? null,
        leadAssignmentId: lead.id,
        orgName: lead.org_name ?? null,
        personName: lead.person_name ?? null,
        personPhone: lead.person_phone ?? null,
      });
    });

    setTasks(items);
    setLoading(false);
  }, [seId]);

  // Initial fetch + auto-refresh every 30 seconds
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 120_000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Also refresh when the page becomes visible (user navigated away and back)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchTasks();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchTasks]);

  if (loading) return null;

  const priorityColors = {
    high: 'text-destructive',
    medium: 'text-warning',
    low: 'text-muted-foreground',
  };

  const priorityBadge = {
    high: 'bg-destructive/10 text-destructive border-destructive/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Wat staat er vandaag op je lijstje?
            {tasks.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {tasks.length} {tasks.length === 1 ? 'taak' : 'taken'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              <Phone className="h-5 w-5 mx-auto mb-2 text-success" />
              <p>Alles afgewerkt — goed bezig! 🎉</p>
              <p className="text-xs mt-1">Start een nieuwe belsessie of bekijk je leads.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {displayTasks.map((task, idx) => {
                const Icon = task.icon;
                return (
                  <li key={task.id}>
                    <button
                      onClick={() => setSelectedIdx(idx)}
                      className="w-full flex items-center gap-3 py-2 px-2 -mx-0 rounded-md hover:bg-muted/50 transition-colors group text-left"
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', priorityColors[task.priority])} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground truncate block">{task.label}</span>
                        {task.sublabel && (
                          <span className="text-[11px] text-muted-foreground">{task.sublabel}</span>
                        )}
                      </div>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 shrink-0', priorityBadge[task.priority])}>
                        {task.priority === 'high' ? 'Hoog' : 'Gemiddeld'}
                      </Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  </li>
                );
              })}
              {tasks.length > 8 && (
                <li className="text-xs text-muted-foreground text-center pt-1">
                  + {tasks.length - 8} meer taken
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Direct klantkaart — opent LeadDetailSheet met alle context */}
      <LeadDetailSheet
        open={!!selectedTask}
        onOpenChange={(open) => { if (!open) { setSelectedIdx(null); fetchTasks(); } }}
        dealTitle={selectedTask?.dealTitle ?? selectedTask?.label ?? undefined}
        orgId={selectedTask?.orgId}
        personId={selectedTask?.personId}
        leadAssignmentId={selectedTask?.leadAssignmentId}
        orgName={selectedTask?.orgName}
        personName={selectedTask?.personName}
        personPhone={selectedTask?.personPhone}
        onPrev={selectedIdx !== null && selectedIdx > 0 ? () => setSelectedIdx(selectedIdx - 1) : null}
        onNext={selectedIdx !== null && selectedIdx < displayTasks.length - 1 ? () => setSelectedIdx(selectedIdx + 1) : null}
      />
    </>
  );
}
