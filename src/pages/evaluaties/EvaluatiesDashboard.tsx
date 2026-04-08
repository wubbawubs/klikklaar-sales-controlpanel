import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileText, BarChart3, ClipboardList, ExternalLink, Users, TrendingUp, ChevronDown, ChevronRight, ThumbsUp, AlertTriangle, Target, MessageCircle, Phone, MessageSquare, CalendarCheck, Star, Zap } from 'lucide-react';
import EodPage from '@/pages/EodPage';

export default function EvaluatiesDashboard() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'evaluaties';
  const [stats, setStats] = useState({ activeForms: 0, todaySubmissions: 0, avgDayScore: 0, coachingNeeded: 0 });
  const [recentSubs, setRecentSubs] = useState<any[]>([]);
  const [eodUrl, setEodUrl] = useState('');
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { count: fc } = await (supabase as any).from('forms').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { data: todaySubs } = await (supabase as any).from('eod_submission_data').select('*').eq('work_date', today);
    const avgDay = todaySubs?.length ? todaySubs.reduce((s: number, r: any) => s + (r.day_score || 0), 0) / todaySubs.length : 0;
    const coaching = todaySubs?.filter((r: any) => (r.day_score || 0) <= 6 || (r.energy_score || 0) <= 6).length || 0;
    const { data: eodForm } = await (supabase as any).from('forms').select('slug').eq('slug', 'end-of-day-evaluatie').maybeSingle();
    if (eodForm) setEodUrl(`${window.location.origin}/form/${eodForm.slug}`);
    const { data: recent } = await (supabase as any).from('eod_submission_data').select('*').order('created_at', { ascending: false }).limit(5);
    setRecentSubs(recent || []);
    if (recent?.length) setLastSubmission(recent[0].created_at);
    setStats({ activeForms: fc || 0, todaySubmissions: todaySubs?.length || 0, avgDayScore: Math.round(avgDay * 10) / 10, coachingNeeded: coaching });
  };

  const toggleItem = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const StatCard = ({ title, value, icon }: { title: string; value: any; icon: React.ReactNode }) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div><p className="text-sm text-muted-foreground">{title}</p><p className="text-2xl font-bold">{value}</p></div>
      </CardContent>
    </Card>
  );

  const TextBlock = ({ label, icon: Icon, value }: { label: string; icon: React.ElementType; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" />{label}</p>
        <p className="text-sm bg-muted p-2 rounded-md">{value}</p>
      </div>
    );
  };

  const scoreColor = (score: number | null) => {
    if (!score) return '';
    if (score <= 6) return 'text-destructive font-medium';
    return '';
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="evaluaties">Evaluaties</TabsTrigger>
          <TabsTrigger value="eod">EOD Beheer</TabsTrigger>
        </TabsList>

        <TabsContent value="evaluaties">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold">Evaluaties & Formulieren</h2>
              <p className="text-muted-foreground">Overzicht van alle formulieren en evaluaties</p>
            </div>

            {eodUrl && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-medium">Live formulier:</span>
                    <a href={eodUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-[300px]">{eodUrl}</a>
                  </div>
                  <div>Responses vandaag: <strong>{stats.todaySubmissions}</strong></div>
                  {lastSubmission && <div>Laatste: <strong>{new Date(lastSubmission).toLocaleString('nl-NL')}</strong></div>}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Actieve formulieren" value={stats.activeForms} icon={<FileText className="h-5 w-5" />} />
              <StatCard title="Responses vandaag" value={stats.todaySubmissions} icon={<ClipboardList className="h-5 w-5" />} />
              <StatCard title="Gem. dagscore vandaag" value={stats.avgDayScore || '—'} icon={<TrendingUp className="h-5 w-5" />} />
              <StatCard title="Coaching nodig" value={stats.coachingNeeded} icon={<Users className="h-5 w-5" />} />
            </div>

            <div className="flex flex-wrap gap-3">
              {eodUrl && (
                <Button asChild><a href={eodUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open live EOD formulier</a></Button>
              )}
              <Button variant="outline" asChild><Link to="/evaluaties/formulieren"><FileText className="mr-2 h-4 w-4" />Beheer formulieren</Link></Button>
              <Button variant="outline" asChild><Link to="/evaluaties/analytics"><BarChart3 className="mr-2 h-4 w-4" />Bekijk analytics</Link></Button>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-lg">Recente evaluaties</CardTitle></CardHeader>
              <CardContent>
                {recentSubs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nog geen evaluaties ontvangen.</p>
                ) : (
                  <div className="space-y-2">
                    {recentSubs.map((s: any) => {
                      const isOpen = expanded[s.id] || false;
                      const hasText = s.good_things || s.blocker_text || s.focus_tomorrow || s.coaching_text;

                      return (
                        <Collapsible key={s.id} open={isOpen} onOpenChange={() => toggleItem(s.id)}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-3">
                                {hasText ? (
                                  isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                ) : <div className="w-4" />}
                                <div>
                                  <p className="font-medium">{s.employee_name || 'Onbekend'}</p>
                                  <p className="text-sm text-muted-foreground">{s.team} | {s.work_date}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                {s.calls_attempted != null && (
                                  <span className="hidden sm:flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{s.calls_attempted}</span>
                                )}
                                {s.real_conversations != null && (
                                  <span className="hidden sm:flex items-center gap-1 text-muted-foreground"><MessageSquare className="h-3 w-3" />{s.real_conversations}</span>
                                )}
                                {s.appointments_set != null && (
                                  <span className="hidden sm:flex items-center gap-1 text-muted-foreground"><CalendarCheck className="h-3 w-3" />{s.appointments_set}</span>
                                )}
                                <span className={`flex items-center gap-1 ${scoreColor(s.day_score)}`}><Star className="h-3 w-3" />{s.day_score ?? '—'}</span>
                                <span className={`flex items-center gap-1 ${scoreColor(s.energy_score)}`}><Zap className="h-3 w-3" />{s.energy_score ?? '—'}</span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          {hasText && (
                            <CollapsibleContent>
                              <div className="ml-7 mt-1 p-3 rounded-lg border bg-muted/20 space-y-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <TextBlock icon={ThumbsUp} label="Wat ging goed" value={s.good_things} />
                                  <TextBlock icon={AlertTriangle} label="Blokkades" value={s.blocker_text} />
                                  <TextBlock icon={Target} label="Focus morgen" value={s.focus_tomorrow} />
                                  <TextBlock icon={MessageCircle} label="Coaching nodig" value={s.coaching_text} />
                                </div>
                              </div>
                            </CollapsibleContent>
                          )}
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="eod">
          <EodPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
