import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flame, Target, Phone, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  seId: string;
}

interface Counts {
  callbacks: number;
  warm: number;
  open: number;
}

export default function QuickActionTiles({ seId }: Props) {
  const [counts, setCounts] = useState<Counts>({ callbacks: 0, warm: 0, open: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seId) return;
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];

      // Callbacks today: calls with callback_date = today
      const { data: callbacks } = await supabase
        .from('calls')
        .select('lead_assignment_id, callback_date')
        .eq('sales_executive_id', seId)
        .eq('callback_date', today);

      // Warm: leads with status interest
      const { count: warmCount } = await supabase
        .from('pipedrive_lead_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('sales_executive_id', seId)
        .eq('status', 'interest');

      // Open: assigned/in_progress
      const { count: openCount } = await supabase
        .from('pipedrive_lead_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('sales_executive_id', seId)
        .in('status', ['assigned', 'in_progress', 'contacted', 'no_answer']);

      setCounts({
        callbacks: callbacks?.length ?? 0,
        warm: warmCount ?? 0,
        open: openCount ?? 0,
      });
      setLoading(false);
    };
    load();
    const i = setInterval(load, 120_000);
    return () => clearInterval(i);
  }, [seId]);

  const tiles = [
    {
      id: 'callbacks',
      label: 'Callbacks vandaag',
      icon: Flame,
      value: counts.callbacks,
      to: '/leads?filter=callbacks_today',
      tone: 'destructive',
    },
    {
      id: 'warm',
      label: 'Warme leads',
      icon: Target,
      value: counts.warm,
      to: '/leads?filter=reached',
      tone: 'success',
    },
    {
      id: 'open',
      label: 'Open leads',
      icon: Phone,
      value: counts.open,
      to: '/leads?filter=untouched',
      tone: 'primary',
    },
  ] as const;

  const toneClasses: Record<string, { ring: string; icon: string; bg: string }> = {
    destructive: { ring: 'border-destructive/30 hover:border-destructive/50', icon: 'text-destructive bg-destructive/10', bg: 'from-destructive/5' },
    success: { ring: 'border-success/30 hover:border-success/50', icon: 'text-success bg-success/10', bg: 'from-success/5' },
    primary: { ring: 'border-primary/30 hover:border-primary/50', icon: 'text-primary bg-primary/10', bg: 'from-primary/5' },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {tiles.map(t => {
        const tc = toneClasses[t.tone];
        const Icon = t.icon;
        return (
          <Link key={t.id} to={t.to} className="block group">
            <Card className={cn(
              'p-5 border bg-gradient-to-br to-transparent transition-all duration-200',
              'hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer',
              tc.ring, tc.bg
            )}>
              <div className="flex items-start justify-between mb-4">
                <div className={cn('p-2.5 rounded-xl', tc.icon)}>
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.label}</p>
              <p className="text-4xl font-bold text-foreground mt-1 tabular-nums">
                {loading ? '—' : t.value}
              </p>
              <Button variant="ghost" size="sm" className="mt-3 -ml-2 h-8 px-2 text-xs gap-1">
                Bel nu <ArrowRight className="h-3 w-3" />
              </Button>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
