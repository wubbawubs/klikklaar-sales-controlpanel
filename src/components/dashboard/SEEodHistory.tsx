import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, CalendarDays, TrendingUp, Zap, Phone, Users, Calendar, Handshake, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Props {
  seName: string;
}

interface EodEntry {
  id: string;
  work_date: string;
  day_score: number | null;
  energy_score: number | null;
  calls_attempted: number | null;
  real_conversations: number | null;
  appointments_set: number | null;
  followups_set: number | null;
  deals_closed: number | null;
  good_things: string | null;
  blocker_text: string | null;
  focus_tomorrow: string | null;
  coaching_text: string | null;
}

export default function SEEodHistory({ seName }: Props) {
  const [entries, setEntries] = useState<EodEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const firstName = seName.split(' ')[0];
      const { data } = await (supabase as any)
        .from('eod_submission_data')
        .select('id, work_date, day_score, energy_score, calls_attempted, real_conversations, appointments_set, followups_set, deals_closed, good_things, blocker_text, focus_tomorrow, coaching_text')
        .ilike('employee_name', `%${firstName}%`)
        .order('work_date', { ascending: false })
        .limit(10);

      setEntries(data || []);
      setLoading(false);
    };
    load();
  }, [seName]);

  if (loading) return null;
  if (entries.length === 0) return null;

  const scoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 8) return 'text-green-600 dark:text-green-400';
    if (score >= 6) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const scoreBg = (score: number | null) => {
    if (!score) return 'bg-muted';
    if (score >= 8) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 6) return 'bg-amber-100 dark:bg-amber-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Mijn evaluaties
          <Badge variant="secondary" className="ml-auto font-normal">{entries.length} recent</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((e) => {
          const isOpen = expanded === e.id;
          return (
            <div
              key={e.id}
              className="rounded-xl border bg-card transition-colors hover:bg-accent/30 cursor-pointer"
              onClick={() => setExpanded(isOpen ? null : e.id)}
            >
              {/* Summary row */}
              <div className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    {format(parseISO(e.work_date), 'EEEE d MMMM', { locale: nl })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBg(e.day_score)} ${scoreColor(e.day_score)}`}>
                    <TrendingUp className="h-3 w-3" />
                    {e.day_score ?? '—'}
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBg(e.energy_score)} ${scoreColor(e.energy_score)}`}>
                    <Zap className="h-3 w-3" />
                    {e.energy_score ?? '—'}
                  </div>
                </div>

                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-3 pb-3 space-y-3 border-t pt-3">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { icon: Phone, label: 'Calls', value: e.calls_attempted },
                      { icon: Users, label: 'Gesprekken', value: e.real_conversations },
                      { icon: Calendar, label: 'Afspraken', value: e.appointments_set },
                      { icon: RotateCcw, label: 'Follow-ups', value: e.followups_set },
                      { icon: Handshake, label: 'Deals', value: e.deals_closed },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-sm font-semibold">{value ?? 0}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {e.good_things && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Wat ging goed</p>
                      <p className="text-sm">{e.good_things}</p>
                    </div>
                  )}
                  {e.blocker_text && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Blokkades</p>
                      <p className="text-sm">{e.blocker_text}</p>
                    </div>
                  )}
                  {e.focus_tomorrow && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Focus morgen</p>
                      <p className="text-sm">{e.focus_tomorrow}</p>
                    </div>
                  )}
                  {e.coaching_text && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Coaching notitie</p>
                      <p className="text-sm">{e.coaching_text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
