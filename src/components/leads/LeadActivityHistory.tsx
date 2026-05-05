import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, MessageSquare, Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface Activity {
  id: string;
  activity_type: string;
  subject: string | null;
  note: string | null;
  outcome: string | null;
  done: boolean;
  due_date: string | null;
  duration_minutes: number | null;
  created_at: string | null;
}

const activityIcons: Record<string, typeof PhoneCall> = {
  call: PhoneCall,
  meeting: Calendar,
  note: MessageSquare,
};

const outcomeColors: Record<string, string> = {
  connected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  no_answer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  voicemail: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  busy: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  callback: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

interface LeadActivityHistoryProps {
  leadAssignmentId: string;
}

export default function LeadActivityHistory({ leadAssignmentId }: LeadActivityHistoryProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('crm_activities')
        .select('id, activity_type, subject, note, outcome, done, due_date, duration_minutes, created_at')
        .eq('lead_assignment_id', leadAssignmentId)
        .order('created_at', { ascending: false });
      setActivities(data || []);
      setLoading(false);
    };
    fetchActivities();
  }, [leadAssignmentId]);

  if (loading) {
    return (
      <div className="py-3 px-4 text-sm text-muted-foreground animate-pulse">
        Activiteiten laden...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="py-3 px-4 text-sm text-muted-foreground flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        Geen activiteiten geregistreerd voor deze lead.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {activities.map((activity) => {
        const Icon = activityIcons[activity.activity_type] || PhoneCall;
        return (
          <div key={activity.id} className="flex items-start gap-3 py-2.5 px-4">
            <div className="mt-0.5">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {activity.subject || activity.activity_type}
                </span>
                {activity.outcome && (
                  <Badge variant="secondary" className={`text-xs ${outcomeColors[activity.outcome] || ''}`}>
                    {activity.outcome.replace('_', ' ')}
                  </Badge>
                )}
                {activity.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {activity.synced_to_pipedrive && (
                  <Badge variant="outline" className="text-xs">Synced</Badge>
                )}
              </div>
              {activity.note && (
                <p className="text-xs text-muted-foreground line-clamp-2">{activity.note}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {activity.created_at && (
                  <span>{new Date(activity.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                )}
                {activity.duration_minutes && (
                  <span>{activity.duration_minutes} min</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
