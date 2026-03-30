import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PhoneForwarded, Target, TrendingUp, ClipboardList, Phone, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealDetailSheet } from '@/components/pipedrive/DealDetailSheet';

interface TaskItem {
  id: string;
  icon: typeof Phone;
  label: string;
  sublabel?: string;
  priority: 'high' | 'medium' | 'low';
  orgId?: number | null;
  personId?: number | null;
  dealTitle?: string | null;
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

  useEffect(() => {
    const fetchTasks = async () => {
      const today = new Date().toISOString().split('T')[0];

      const [callbacksRes, leadsRes, interestRes] = await Promise.all([
        // Callbacks with lead assignment data for org/person IDs
        supabase
          .from('calls')
          .select('id, contact_name, org_name, callback_date, lead_assignment_id')
          .eq('sales_executive_id', seId)
          .eq('outcome', 'callback')
          .lte('callback_date', today)
          .not('callback_date', 'is', null)
          .order('callback_date', { ascending: true }),
        // Untouched leads with Pipedrive IDs
        supabase
          .from('pipedrive_lead_assignments')
          .select('id, org_name, person_name, deal_title, pipedrive_org_id, pipedrive_person_id')
          .eq('sales_executive_id', seId)
          .in('status', ['assigned'])
          .order('created_at', { ascending: true }),
        // Interest follow-ups with lead assignment
        supabase
          .from('calls')
          .select('id, contact_name, org_name, created_at, lead_assignment_id')
          .eq('sales_executive_id', seId)
          .eq('outcome', 'interest')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      // Collect lead_assignment_ids to fetch org/person IDs for callbacks and interest calls
      const assignmentIds = [
        ...(callbacksRes.data || []).map(c => c.lead_assignment_id).filter(Boolean),
        ...(interestRes.data || []).map(c => c.lead_assignment_id).filter(Boolean),
      ];

      let assignmentMap: Record<string, { pipedrive_org_id: number | null; pipedrive_person_id: number | null; deal_title: string | null }> = {};
      if (assignmentIds.length > 0) {
        const { data: assignments } = await supabase
          .from('pipedrive_lead_assignments')
          .select('id, pipedrive_org_id, pipedrive_person_id, deal_title')
          .in('id', assignmentIds);
        (assignments || []).forEach(a => {
          assignmentMap[a.id] = { pipedrive_org_id: a.pipedrive_org_id, pipedrive_person_id: a.pipedrive_person_id, deal_title: a.deal_title };
        });
      }

      const items: TaskItem[] = [];

      // Overdue callbacks — high priority
      (callbacksRes.data || []).forEach(cb => {
        const isOverdue = cb.callback_date! < today;
        const assignment = cb.lead_assignment_id ? assignmentMap[cb.lead_assignment_id] : null;
        items.push({
          id: `cb-${cb.id}`,
          icon: PhoneForwarded,
          label: `Bel terug: ${cb.contact_name || cb.org_name || 'Contact'}`,
          sublabel: isOverdue ? `Gepland: ${cb.callback_date}` : 'Vandaag',
          priority: 'high',
          orgId: assignment?.pipedrive_org_id ?? null,
          personId: assignment?.pipedrive_person_id ?? null,
          dealTitle: assignment?.deal_title ?? null,
        });
      });

      // Interest follow-ups older than 2 days
      (interestRes.data || []).filter(c => {
        const daysSince = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince >= 2;
      }).forEach(c => {
        const assignment = c.lead_assignment_id ? assignmentMap[c.lead_assignment_id] : null;
        items.push({
          id: `fu-${c.id}`,
          icon: TrendingUp,
          label: `Opvolgen: ${c.contact_name || c.org_name || 'Contact'}`,
          sublabel: 'Toonde interesse, nog niet opgevolgd',
          priority: 'high',
          orgId: assignment?.pipedrive_org_id ?? null,
          personId: assignment?.pipedrive_person_id ?? null,
          dealTitle: assignment?.deal_title ?? null,
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
          orgId: lead.pipedrive_org_id ?? null,
          personId: lead.pipedrive_person_id ?? null,
          dealTitle: lead.deal_title ?? null,
        });
      });

      setTasks(items);
      setLoading(false);
    };
    fetchTasks();
  }, [seId]);

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
              {tasks.slice(0, 8).map(task => {
                const Icon = task.icon;
                const hasContext = !!(task.orgId || task.personId);
                return (
                  <li key={task.id}>
                    <button
                      onClick={() => setSelectedTask(task)}
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

      {/* Direct klantkaart — opent DealDetailSheet met alle context */}
      <DealDetailSheet
        open={!!selectedTask}
        onOpenChange={(open) => { if (!open) setSelectedTask(null); }}
        dealTitle={selectedTask?.dealTitle ?? selectedTask?.label ?? undefined}
        orgId={selectedTask?.orgId}
        personId={selectedTask?.personId}
      />
    </>
  );
}
