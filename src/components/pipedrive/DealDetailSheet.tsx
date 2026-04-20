import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, User, Mail, Clock, Loader2, MapPin, TrendingUp, Calendar, ChevronLeft, ChevronRight, PhoneCall, FileText, Tag, StickyNote } from 'lucide-react';
import { CallScriptSection } from './CallScriptSection';
import { InlineCallLogger } from './InlineCallLogger';
import { ExpandableNote } from '@/components/ui/expandable-note';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PhoneCell, WebsiteCell } from '@/components/leads/ContactCells';
import { supabase } from '@/integrations/supabase/client';

const CALENDLY_URL = 'https://calendly.com/luuk-kliklaarseo/kennismaking-klikklaarseo-luuk-wubs';

interface DealDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle?: string;
  dealValue?: number;
  dealExpectedClose?: string | null;
  orgId?: number | null;
  personId?: number | null;
  leadAssignmentId?: string | null;
  orgName?: string | null;
  personName?: string | null;
  personPhone?: string | null;
  personEmail?: string | null;
  website?: string | null;
  branche?: string | null;
  productLine?: string | null;
  notes?: string | null;
  status?: string | null;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

interface OrgDetail {
  id: number;
  name: string;
  address: string | null;
  owner_name: string | null;
  people_count: number;
  open_deals_count: number;
  won_deals_count: number;
  lost_deals_count: number;
}

interface Person {
  id: number;
  name: string;
  email: string[];
  phone: string[];
  job_title: string | null;
}

interface CallEntry {
  id: string;
  outcome: string;
  notes: string | null;
  callback_date: string | null;
  callback_time: string | null;
  created_at: string;
}

const headers = {
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};
const BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

const OUTCOME_LABELS: Record<string, string> = {
  not_reached: 'Niet bereikt',
  callback: 'Callback gepland',
  interested: 'Interesse',
  appointment: 'Afspraak',
  not_interested: 'Geen interesse',
  invalid_number: 'Ongeldig nummer',
  voicemail: 'Voicemail',
};

export function DealDetailSheet({
  open, onOpenChange, dealTitle, dealValue, dealExpectedClose,
  orgId, personId, leadAssignmentId,
  orgName, personName, personPhone, personEmail, website, branche, productLine, notes, status,
  onPrev, onNext,
}: DealDetailSheetProps) {
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [showCallLogger, setShowCallLogger] = useState(false);
  const [showCalendly, setShowCalendly] = useState(false);

  // Pipedrive org/contacts (best-effort, only when orgId present)
  useEffect(() => {
    if (!open || !orgId) {
      setOrg(null);
      setPersons([]);
      return;
    }
    setLoading(true);
    fetch(`${BASE}/pipedrive-organizations?org_id=${orgId}`, { headers })
      .then(r => r.json())
      .then(orgData => {
        setOrg(orgData.organization || null);
        setPersons(orgData.persons || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, orgId]);

  // Local call history (this is the real "historie" — what the SE logged)
  useEffect(() => {
    if (!open || !leadAssignmentId) {
      setCalls([]);
      return;
    }
    supabase
      .from('calls')
      .select('id, outcome, notes, callback_date, callback_time, created_at')
      .eq('lead_assignment_id', leadAssignmentId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setCalls(data ?? []));
  }, [open, leadAssignmentId]);

  const refreshCalls = () => {
    if (!leadAssignmentId) return;
    supabase
      .from('calls')
      .select('id, outcome, notes, callback_date, callback_time, created_at')
      .eq('lead_assignment_id', leadAssignmentId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setCalls(data ?? []));
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v);

  // Prefill Calendly met klantgegevens zodat SE niets hoeft te typen
  const calendlyParams = new URLSearchParams({
    hide_gdpr_banner: '1',
    primary_color: '0F9B7A',
  });
  if (personName) calendlyParams.set('name', personName);
  if (personEmail) calendlyParams.set('email', personEmail);
  const a1Parts = [orgName, personPhone, branche].filter(Boolean).join(' · ');
  if (a1Parts) calendlyParams.set('a1', a1Parts);
  const calendlyUrl = `${CALENDLY_URL}?${calendlyParams.toString()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[98vw] h-[95dvh] sm:rounded-2xl p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base leading-tight flex-1">{dealTitle || orgName || org?.name || 'Details'}</DialogTitle>
            {(onPrev || onNext) && (
              <div className="flex items-center gap-1 shrink-0 mr-6">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!onPrev} onClick={() => onPrev?.()}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!onNext} onClick={() => onNext?.()}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          {dealValue != null && (
            <DialogDescription className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-semibold text-primary">{formatCurrency(dealValue)}</span>
              {dealExpectedClose && (
                <span className="text-muted-foreground">· Verwacht {new Date(dealExpectedClose).toLocaleDateString('nl-NL')}</span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Inline Call Logger */}
        <div className="px-5 pb-2">
          <Collapsible open={showCallLogger} onOpenChange={setShowCallLogger}>
            <CollapsibleTrigger asChild>
              <Button className="w-full gap-2" size="sm" variant={showCallLogger ? 'outline' : 'default'}>
                <PhoneCall className="h-4 w-4" />
                {showCallLogger ? 'Verberg call logger' : 'Log call'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <InlineCallLogger
                leadAssignmentId={leadAssignmentId}
                orgName={orgName || org?.name}
                personName={personName || persons[0]?.name}
                personPhone={personPhone || persons[0]?.phone?.[0]}
                onLogged={refreshCalls}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Call Script */}
        <div className="px-5 pb-2">
          <CallScriptSection contactName={personName || persons[0]?.name} branche={branche} />
        </div>

        <ScrollArea className="flex-1">
          <div className="px-5 pb-5 space-y-5">
            {/* Lead-info — alle gegevens, klikbaar, op één plek */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Lead-info</h4>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm">{orgName || org?.name || '—'}</span>
                  {status && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>}
                </div>
                {personName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{personName}</span>
                  </div>
                )}
                {personPhone && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">Telefoon</span>
                    <PhoneCell phone={personPhone} />
                  </div>
                )}
                {personEmail && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">Email</span>
                    <a
                      href={`mailto:${personEmail}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Mail className="h-3 w-3" />{personEmail}
                    </a>
                  </div>
                )}
                {website && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">Website</span>
                    <WebsiteCell website={website} />
                  </div>
                )}
                {branche && (
                  <div className="flex items-center gap-2 text-xs">
                    <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Branche:</span>
                    <span>{branche}</span>
                  </div>
                )}
                {productLine && (
                  <div className="flex items-center gap-2 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Productlijn:</span>
                    <span>{productLine}</span>
                  </div>
                )}
                {org?.address && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{org.address}</span>
                  </div>
                )}
                {notes && (
                  <div className="flex items-start gap-2 text-xs pt-1 border-t border-border/50">
                    <StickyNote className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="whitespace-pre-wrap">{notes}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Calendly — afspraak inplannen */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Afspraak inplannen</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setShowCalendly(s => !s)}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  {showCalendly ? 'Verberg' : 'Toon planner'}
                </Button>
              </div>
              {showCalendly ? (
                <div className="rounded-lg border overflow-hidden bg-background">
                  <iframe
                    src={calendlyUrl}
                    title="Calendly planner"
                    className="w-full"
                    style={{ height: 720, border: 0 }}
                    loading="lazy"
                  />
                </div>
              ) : (
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  Klik op "Toon planner" om direct in dit venster een afspraak in te plannen, of open Calendly in een nieuw tabblad.
                </a>
              )}
            </section>

            {/* Extra Pipedrive contacten (alleen als er meer zijn dan de hoofdcontact) */}
            {persons.length > 1 && (
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Overige contactpersonen ({persons.length - 1})</h4>
                <div className="space-y-2">
                  {persons.slice(1).map(p => (
                    <div key={p.id} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{p.name}</span>
                        {p.job_title && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.job_title}</Badge>}
                      </div>
                      {p.phone.length > 0 && p.phone.map((ph, i) => (
                        <div key={`p-${i}`}><PhoneCell phone={ph} /></div>
                      ))}
                      {p.email.length > 0 && p.email.map((em, i) => (
                        <a key={`e-${i}`} href={`mailto:${em}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 text-xs text-primary hover:underline">
                          <Mail className="h-3 w-3" />{em}
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            {/* Bel-historie (lokaal gelogd) */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Bel-historie ({calls.length})</h4>
              {loading && calls.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Laden...
                </div>
              ) : calls.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nog geen calls gelogd voor deze lead.</p>
              ) : (
                <div className="space-y-2">
                  {calls.map(c => (
                    <div key={c.id} className="rounded-lg border p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">{OUTCOME_LABELS[c.outcome] ?? c.outcome}</Badge>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(c.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {c.callback_date && (
                        <div className="text-[11px] text-muted-foreground">
                          Callback: {new Date(c.callback_date).toLocaleDateString('nl-NL')}{c.callback_time ? ` ${c.callback_time}` : ''}
                        </div>
                      )}
                      {c.notes && (
                        <ExpandableNote
                          text={c.notes}
                          title="Notitie call"
                          icon="file"
                          lineClamp={3}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
