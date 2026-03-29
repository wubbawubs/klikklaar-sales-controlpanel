import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { PhoneForwarded, Target, Phone, TrendingUp, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskItem {
  id: string;
  icon: typeof Phone;
  label: string;
  sublabel?: string;
  link: string;
  priority: 'high' | 'medium' | 'low';
  category: 'callback' | 'lead' | 'follow_up' | 'activity';
}

interface Props {
  seId: string;
}

export default function SETaskChecklist({ seId }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      const today = new Date().toISOString().split('T')[0];

      const [callbacksRes, leadsRes, interestRes] = await Promise.all([
        supabase
          .from('calls')
          .select('id, contact_name, org_name, callback_date')
          .eq('sales_executive_id', seId)
          .eq('outcome', 'callback')
          .lte('callback_date', today)
          .not('callback_date', 'is', null)
          .order('callback_date', { ascending: true }),
        supabase
          .from('pipedrive_lead_assignments')
          .select('id, org_name, person_name')
          .eq('sales_executive_id', seId)
          .in('status', ['assigned'])
          .order('created_at', { ascending: true }),
        supabase
          .from('calls')
          .select('id, contact_name, org_name, created_at')
          .eq('sales_executive_id', seId)
          .eq('outcome', 'interest')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const items: TaskItem[] = [];

      // Overdue callbacks — high priority
      (callbacksRes.data || []).forEach(cb => {
        const isOverdue = cb.callback_date < today;
        items.push({
          id: `cb-${cb.id}`,
          icon: PhoneForwarded,
          label: `Bel terug: ${cb.contact_name || cb.org_name || 'Contact'}`,
          sublabel: isOverdue ? `Gepland: ${cb.callback_date}` : `Vandaag`,
          link: '/calls',
          priority: 'high',
          category: 'callback',
        });
      });

      // Interest follow-ups older than 2 days
      (interestRes.data || []).filter(c => {
        const daysSince = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince >= 2;
      }).forEach(c => {
        items.push({
          id: `fu-${c.id}`,
          icon: TrendingUp,
          label: `Opvolgen: ${c.contact_name || c.org_name || 'Contact'}`,
          sublabel: 'Toonde interesse, nog niet opgevolgd',
          link: '/leads',
          priority: 'high',
          category: 'follow_up',
        });
      });

      // Untouched leads — medium priority
      (leadsRes.data || []).forEach(lead => {
        items.push({
          id: `lead-${lead.id}`,
          icon: Target,
          label: `Bel: ${lead.org_name || lead.person_name || 'Nieuwe lead'}`,
          sublabel: 'Nog niet gebeld',
          link: '/leads',
          priority: 'medium',
          category: 'lead',
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
              return (
                <li key={task.id}>
                  <Link
                    to={task.link}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
                  >
                    <Checkbox className="pointer-events-none" />
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
                  </Link>
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
  );
}
