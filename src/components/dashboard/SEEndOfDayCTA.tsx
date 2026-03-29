import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, CheckCircle2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Props {
  seId: string;
  seName: string;
}

export default function SEEndOfDayCTA({ seId, seName }: Props) {
  const [eodUrl, setEodUrl] = useState('');
  const [todayDone, setTodayDone] = useState(false);
  const [recentCount, setRecentCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      // Get form slug
      const { data: form } = await (supabase as any)
        .from('forms')
        .select('slug')
        .eq('slug', 'end-of-day-evaluatie')
        .eq('status', 'active')
        .maybeSingle();

      if (form) {
        setEodUrl(`${window.location.origin}/form/${form.slug}`);
      }

      // Check if today's EOD is already submitted
      const today = new Date().toISOString().split('T')[0];
      const firstName = seName.split(' ')[0];

      const { data: todaySubs } = await (supabase as any)
        .from('eod_submission_data')
        .select('id')
        .eq('work_date', today)
        .ilike('employee_name', `%${firstName}%`)
        .limit(1);

      if (todaySubs && todaySubs.length > 0) {
        setTodayDone(true);
      }

      // Count recent submissions (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count } = await (supabase as any)
        .from('eod_submission_data')
        .select('*', { count: 'exact', head: true })
        .ilike('employee_name', `%${firstName}%`)
        .gte('work_date', weekAgo.toISOString().split('T')[0]);

      setRecentCount(count || 0);
    };
    load();
  }, [seId, seName]);

  if (!eodUrl) return null;

  const today = format(new Date(), 'EEEE d MMMM', { locale: nl });

  if (todayDone) {
    return (
      <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/40">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-green-800 dark:text-green-300">EOD ingevuld voor vandaag ✓</p>
            <p className="text-sm text-green-600/80 dark:text-green-400/70">
              {recentCount} evaluatie{recentCount !== 1 ? 's' : ''} deze week
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent hover:border-primary/30 transition-colors">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Klaar voor vandaag?</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sluit {today} af met een korte evaluatie — het kost je maar 2 minuten.
            </p>
            {recentCount > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                {recentCount} evaluatie{recentCount !== 1 ? 's' : ''} ingevuld deze week
              </p>
            )}
          </div>
          <Button asChild size="lg" className="shrink-0 gap-2">
            <a href={eodUrl} target="_blank" rel="noopener noreferrer">
              Dag afsluiten
              <ChevronRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
