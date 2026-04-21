import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, CheckCircle2, ChevronRight, X } from 'lucide-react';

interface Props {
  seId: string;
  seName: string;
}

const DISMISS_KEY = 'kk-eod-dismissed-date';

export default function SEEndOfDayCTA({ seId, seName }: Props) {
  const [eodUrl, setEodUrl] = useState('');
  const [todayDone, setTodayDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(new Date());

  // Refresh time every minute so the bar appears at 16:00
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const dismissedDate = localStorage.getItem(DISMISS_KEY);
    if (dismissedDate === today) setDismissed(true);

    const load = async () => {
      const { data: form } = await (supabase as any)
        .from('forms')
        .select('slug')
        .eq('slug', 'end-of-day-evaluatie')
        .eq('status', 'active')
        .maybeSingle();

      if (form) {
        setEodUrl(`${window.location.origin}/form/${form.slug}`);
      }

      const firstName = seName.split(' ')[0];
      const { data: todaySubs } = await (supabase as any)
        .from('eod_submission_data')
        .select('id')
        .eq('work_date', today)
        .ilike('employee_name', `%${firstName}%`)
        .limit(1);

      if (todaySubs && todaySubs.length > 0) setTodayDone(true);
    };
    load();
  }, [seId, seName]);

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  if (!eodUrl || dismissed || todayDone) return null;

  // Only show from 16:00 onwards
  if (now.getHours() < 16) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 sm:px-6 sm:pb-6 pointer-events-none">
      <div className="mx-auto max-w-3xl pointer-events-auto">
        <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-md shadow-card-hover p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Sluit je dag af</p>
            <p className="text-xs text-muted-foreground hidden sm:block">Korte EOD evaluatie, 2 minuten</p>
          </div>
          <Button asChild size="sm" className="shrink-0 gap-1">
            <a href={eodUrl} target="_blank" rel="noopener noreferrer">
              EOD invullen
              <ChevronRight className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Re-export a small "done" state badge for reuse if needed elsewhere
export function EodDoneBadge() {
  return (
    <div className="inline-flex items-center gap-2 text-xs text-success">
      <CheckCircle2 className="h-4 w-4" /> EOD ingevuld
    </div>
  );
}
