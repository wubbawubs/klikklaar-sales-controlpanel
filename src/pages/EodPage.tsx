import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Phone, MessageSquare, CalendarCheck, RefreshCw, CheckCircle, Star, Zap, Save, X, Pencil, MessageCircle, ThumbsUp, AlertTriangle, Target } from 'lucide-react';
import { toast } from 'sonner';
import type { EodSubmission, SalesExecutive } from '@/types/database';

interface EodDetail {
  calls_attempted?: number | null;
  real_conversations?: number | null;
  appointments_set?: number | null;
  followups_set?: number | null;
  deals_closed?: number | null;
  day_score?: number | null;
  energy_score?: number | null;
  good_things?: string | null;
  blocker_text?: string | null;
  coaching_text?: string | null;
  focus_tomorrow?: string | null;
  extra_notes?: string | null;
}

export default function EodPage() {
  const [eods, setEods] = useState<(EodSubmission & { se_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, EodDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<Record<string, boolean>>({});
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => { loadEods(); }, []);

  const loadEods = async () => {
    const [eodRes, seRes] = await Promise.all([
      supabase.from('eod_submissions').select('*').order('session_date', { ascending: false }),
      supabase.from('sales_executives').select('id, first_name, last_name, full_name'),
    ]);
    const ses = (seRes.data || []) as SalesExecutive[];
    const mapped = (eodRes.data || []).map(e => ({
      ...e,
      se_name: ses.find(s => s.id === e.sales_executive_id)?.full_name || 'Onbekend',
    }));
    setEods(mapped);
    setLoading(false);
  };

  const toggleRow = async (eod: EodSubmission & { se_name?: string }) => {
    const isOpen = !expanded[eod.id];
    setExpanded(prev => ({ ...prev, [eod.id]: isOpen }));

    if (isOpen && !details[eod.id]) {
      setLoadingDetail(prev => ({ ...prev, [eod.id]: true }));
      const { data } = await supabase
        .from('eod_submission_data')
        .select('*')
        .eq('sales_executive_id', eod.sales_executive_id)
        .eq('work_date', eod.session_date)
        .limit(1)
        .maybeSingle();

      if (data) {
        setDetails(prev => ({ ...prev, [eod.id]: data }));
      } else {
        // Fall back to summary_json
        const s = (eod.summary_json as Record<string, any>) || {};
        setDetails(prev => ({ ...prev, [eod.id]: {
          calls_attempted: s.calls ?? s.calls_attempted,
          real_conversations: s.conversations ?? s.real_conversations,
          appointments_set: s.appointments ?? s.appointments_set,
          followups_set: s.followups ?? s.followups_set,
          deals_closed: s.deals ?? s.deals_closed,
          day_score: s.day_score,
          energy_score: s.energy_score,
          good_things: s.good_things,
          blocker_text: s.blocker_text,
          focus_tomorrow: s.focus_tomorrow,
          coaching_text: s.coaching_text,
        }}));
      }
      setLoadingDetail(prev => ({ ...prev, [eod.id]: false }));
    }
  };

  const updateStatus = async (eodId: string, newStatus: string) => {
    const { error } = await supabase.from('eod_submissions').update({ status: newStatus }).eq('id', eodId);
    if (error) { toast.error('Fout bij bijwerken'); return; }
    setEods(prev => prev.map(e => e.id === eodId ? { ...e, status: newStatus } : e));
    toast.success('Status bijgewerkt');
  };

  const updateFollowUp = async (eodId: string, newStatus: string) => {
    const followUpRequired = newStatus !== 'none';
    const { error } = await supabase.from('eod_submissions').update({ follow_up_status: newStatus, follow_up_required: followUpRequired }).eq('id', eodId);
    if (error) { toast.error('Fout bij bijwerken'); return; }
    setEods(prev => prev.map(e => e.id === eodId ? { ...e, follow_up_status: newStatus, follow_up_required: followUpRequired } : e));
    toast.success('Opvolging bijgewerkt');
  };

  const startEditNotes = (eodId: string, current: string | null) => {
    setEditingNotes(eodId);
    setNotesDraft(current || '');
  };

  const saveNotes = async (eodId: string) => {
    const { error } = await supabase.from('eod_submissions').update({ coach_notes: notesDraft || null }).eq('id', eodId);
    if (error) { toast.error('Fout bij opslaan'); return; }
    setEods(prev => prev.map(e => e.id === eodId ? { ...e, coach_notes: notesDraft || null } : e));
    setEditingNotes(null);
    toast.success('Notitie opgeslagen');
  };

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const todayEods = eods.filter(e => e.session_date === today);
  const weekEods = eods.filter(e => e.session_date >= weekAgo);

  const MetricPill = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | null | undefined }) => {
    if (value === null || value === undefined) return null;
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold">{value}</p>
        </div>
      </div>
    );
  };

  const TextBlock = ({ label, icon: Icon, value }: { label: string; icon: React.ElementType; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" />{label}</p>
        <p className="text-sm bg-muted p-2 rounded-md">{value}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">End of Day Beheer</h1>
        <p className="text-muted-foreground text-sm mt-1">Overzicht en opvolging van EOD-evaluaties</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vandaag ingediend</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{todayEods.filter(e => e.status !== 'pending').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Opvolging nodig</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{eods.filter(e => e.follow_up_required && e.follow_up_status !== 'completed').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Deze week</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{weekEods.length}</p></CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Laden...</CardContent></Card>
        ) : eods.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Nog geen EOD-inzendingen.</CardContent></Card>
        ) : eods.map(eod => {
          const isOpen = expanded[eod.id] || false;
          const detail = details[eod.id];
          const isLoadingDetail = loadingDetail[eod.id];

          return (
            <Card key={eod.id}>
              <Collapsible open={isOpen} onOpenChange={() => toggleRow(eod)}>
                <CollapsibleTrigger asChild>
                  <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <div>
                          <span className="font-medium">{eod.se_name}</span>
                          <span className="text-muted-foreground text-sm ml-2">
                            {new Date(eod.session_date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={eod.status} />
                        <StatusBadge status={eod.follow_up_status} />
                      </div>
                    </div>
                    {eod.coach_notes && (
                      <p className="text-xs text-muted-foreground mt-1 ml-7 flex items-center gap-1">
                        <MessageCircle className="h-3 w-3 shrink-0" /> {eod.coach_notes}
                      </p>
                    )}
                  </CardContent>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t pt-3 space-y-4">
                    {isLoadingDetail ? (
                      <p className="text-sm text-muted-foreground">Laden...</p>
                    ) : (
                      <>
                        {/* Inline status editing */}
                        <div className="flex flex-wrap gap-4 items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Status:</span>
                            <Select value={eod.status || 'pending'} onValueChange={v => updateStatus(eod.id, v)}>
                              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">In afwachting</SelectItem>
                                <SelectItem value="submitted">Ingediend</SelectItem>
                                <SelectItem value="reviewed">Beoordeeld</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Opvolging:</span>
                            <Select value={eod.follow_up_status || 'none'} onValueChange={v => updateFollowUp(eod.id, v)}>
                              <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Geen</SelectItem>
                                <SelectItem value="pending">In afwachting</SelectItem>
                                <SelectItem value="completed">Voltooid</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Metrics */}
                        {detail && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                            <MetricPill icon={Phone} label="Pogingen" value={detail.calls_attempted} />
                            <MetricPill icon={MessageSquare} label="Gesprekken" value={detail.real_conversations} />
                            <MetricPill icon={CalendarCheck} label="Afspraken" value={detail.appointments_set} />
                            <MetricPill icon={RefreshCw} label="Follow-ups" value={detail.followups_set} />
                            <MetricPill icon={CheckCircle} label="Deals" value={detail.deals_closed} />
                            <MetricPill icon={Star} label="Dagscore" value={detail.day_score} />
                            <MetricPill icon={Zap} label="Energie" value={detail.energy_score} />
                          </div>
                        )}

                        {/* Open text fields */}
                        {detail && (
                          <div className="space-y-2">
                            <TextBlock icon={ThumbsUp} label="Wat ging goed" value={detail.good_things} />
                            <TextBlock icon={AlertTriangle} label="Blokkades" value={detail.blocker_text} />
                            <TextBlock icon={Target} label="Focus morgen" value={detail.focus_tomorrow} />
                            <TextBlock icon={MessageCircle} label="Coaching nodig" value={detail.coaching_text} />
                            {detail.extra_notes && <TextBlock icon={MessageSquare} label="Extra notities" value={detail.extra_notes} />}
                          </div>
                        )}

                        {!detail && (
                          <p className="text-sm text-muted-foreground italic">Geen gedetailleerde data beschikbaar.</p>
                        )}

                        {/* Coach notes editor */}
                        <div className="border-t pt-3 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <Pencil className="h-3 w-3" /> Coach notitie
                          </p>
                          {editingNotes === eod.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={notesDraft}
                                onChange={e => setNotesDraft(e.target.value)}
                                placeholder="Schrijf een coaching notitie..."
                                rows={3}
                                className="text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveNotes(eod.id)}><Save className="mr-1 h-3 w-3" />Opslaan</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)}><X className="mr-1 h-3 w-3" />Annuleer</Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="p-2 rounded-md bg-muted/50 text-sm cursor-pointer hover:bg-muted transition-colors min-h-[2.5rem] flex items-center"
                              onClick={(e) => { e.stopPropagation(); startEditNotes(eod.id, eod.coach_notes); }}
                            >
                              {eod.coach_notes || <span className="text-muted-foreground italic">Klik om een notitie toe te voegen...</span>}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
