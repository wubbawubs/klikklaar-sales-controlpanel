import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useDealHistory } from '@/hooks/useFunnels';
import { historyLine, actorName, type ActorNames } from '@/lib/historyText';
import type { CrmField, Stage } from '@/lib/crmTypes';

function useActorNames(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['profile-names', key],
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', key);
      if (error) throw error;
      const names: ActorNames = {};
      for (const p of data ?? []) names[p.user_id] = p.full_name || p.email || '';
      return names;
    },
  });
}

const dayLabel = (d: Date) =>
  isToday(d) ? 'Vandaag' : isYesterday(d) ? 'Gisteren' : format(d, 'EEEE d MMMM yyyy', { locale: nl });

export function HistoryTab({ dealId, fields, stages }: { dealId: string; fields: CrmField[]; stages: Stage[] }) {
  const { data: rows = [], isLoading, error } = useDealHistory(dealId);
  const { data: names = {} } = useActorNames(rows.map(r => r.actor).filter((a): a is string => !!a));

  const groups = useMemo(() => {
    const out: { day: string; items: { id: string; text: string; who: string; time: string }[] }[] = [];
    for (const r of rows) {
      const text = historyLine(r, fields, stages, names);
      if (!text) continue;
      const at = parseISO(r.at);
      const day = dayLabel(at);
      let g = out[out.length - 1];
      if (!g || g.day !== day) { g = { day, items: [] }; out.push(g); }
      g.items.push({ id: r.id, text, who: actorName(r.actor, names), time: format(at, 'HH:mm') });
    }
    return out;
  }, [rows, fields, stages, names]);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded-xl bg-black/[0.04] motion-reduce:animate-none" />)}
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">Historie laden mislukt.</p>;
  if (!groups.length) return <p className="py-8 text-center text-sm text-muted-foreground">Nog geen wijzigingen vastgelegd.</p>;

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <section key={g.day}>
          <h4 className="mb-2 text-[13px] font-semibold text-[#4a5563] first-letter:uppercase dark:text-muted-foreground">{g.day}</h4>
          <ol className="relative space-y-0 border-l border-black/[0.08] pl-5 dark:border-border">
            {g.items.map(it => (
              <li key={it.id} className="relative py-2">
                <span className="absolute -left-[25px] top-[14px] h-2 w-2 rounded-full bg-primary ring-4 ring-[#f6f8f6] dark:ring-background" aria-hidden />
                <p className="text-sm leading-snug [overflow-wrap:anywhere]">{it.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground tabular">{it.who}, {it.time}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
