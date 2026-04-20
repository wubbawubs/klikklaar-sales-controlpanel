import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2, User, Mail, Clock, Loader2, MapPin, TrendingUp, Calendar,
  ChevronLeft, ChevronRight, PhoneCall, FileText, Tag, StickyNote,
  Phone, Globe, Copy, ExternalLink,
} from 'lucide-react';
import { CallScriptSection } from './CallScriptSection';
import { InlineCallLogger } from './InlineCallLogger';
import { ExpandableNote } from '@/components/ui/expandable-note';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CALENDLY_URL = 'https://calendly.com/luuk-kliklaarseo/kennismaking-klikklaarseo-luuk-wubs';

interface DealDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle?: string;
  dealValue?: number;
  dealExpectedClose?: string | null;
  assignedAt?: string | null;
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

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: {
        url: string;
        parentElement: HTMLElement;
        prefill?: Record<string, unknown>;
      }) => void;
    };
  }
}

const CALENDLY_SCRIPT_SRC = 'https://assets.calendly.com/assets/external/widget.js';
const CALENDLY_CSS_HREF = 'https://assets.calendly.com/assets/external/widget.css';

function ensureCalendlyAssets(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject();
    if (!document.querySelector(`link[href="${CALENDLY_CSS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CALENDLY_CSS_HREF;
      document.head.appendChild(link);
    }
    if (window.Calendly) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CALENDLY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject());
      return;
    }
    const script = document.createElement('script');
    script.src = CALENDLY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.head.appendChild(script);
  });
}

/* ------- Copyable field used inside the details block ------- */
interface CopyFieldProps {
  label: string;
  value: string | null | undefined;
  icon: React.ReactNode;
  action?: { href: string; icon: React.ReactNode; title: string };
}
function CopyField({ label, value, icon, action }: CopyFieldProps) {
  if (!value) return null;
  const copy = () => {
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} gekopieerd`),
      () => toast.error('Kopiëren mislukt'),
    );
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); }
  };
  return (
    <div className="flex items-start gap-1.5 group min-w-0">
      <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-14 shrink-0 mt-0.5">{label}</span>
      <button
        type="button"
        onClick={copy}
        onKeyDown={onKey}
        tabIndex={0}
        className="text-xs text-foreground hover:text-primary text-left flex-1 min-w-0 break-all focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 -mx-1"
        title="Klik om te kopiëren"
      >
        {value}
      </button>
      {action && (
        <a
          href={action.href}
          target={action.href.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={action.title}
          className="text-muted-foreground hover:text-primary p-0.5 rounded shrink-0 mt-0.5"
        >
          {action.icon}
        </a>
      )}
    </div>
  );
}

interface PlainFieldProps {
  label: string;
  value: string | null | undefined;
  icon: React.ReactNode;
}
function PlainField({ label, value, icon }: PlainFieldProps) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-14 shrink-0">{label}</span>
      <span className="text-xs text-foreground truncate flex-1">{value}</span>
    </div>
  );
}

export function DealDetailSheet({
  open, onOpenChange, dealTitle, dealValue, dealExpectedClose, assignedAt,
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
  const calendlyRef = useRef<HTMLDivElement>(null);

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

  // Local call history
  useEffect(() => {
    if (!open || !leadAssignmentId) { setCalls([]); return; }
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

  // Calendly inline widget — proper prefill via official script
  useEffect(() => {
    if (!showCalendly || !open) return;
    const el = calendlyRef.current;
    if (!el) return;
    let cancelled = false;
    ensureCalendlyAssets()
      .then(() => {
        if (cancelled || !window.Calendly || !calendlyRef.current) return;
        calendlyRef.current.innerHTML = '';
        const phone = normalizeNlPhone(personPhone ?? persons[0]?.phone?.[0] ?? '');
        const customAnswers: Record<string, string> = {};
        if (phone) customAnswers.a1 = phone;
        if (website) customAnswers.a2 = website;
        if (orgName) customAnswers.a3 = orgName;
        window.Calendly.initInlineWidget({
          url: CALENDLY_URL + '?hide_gdpr_banner=1&primary_color=0F9B7A',
          parentElement: calendlyRef.current,
          prefill: {
            name: personName ?? persons[0]?.name ?? '',
            email: personEmail ?? persons[0]?.email?.[0] ?? '',
            customAnswers,
          },
        });
      })
      .catch(() => {/* fallback link is shown */});
    return () => { cancelled = true; };
  }, [showCalendly, open, personName, personEmail, personPhone, website, orgName, persons]);

  // Aggregate alle telefoon/email entries (hoofdcontact + Pipedrive), normaliseer NL nummers naar +31
  const allPhones = Array.from(new Set([
    ...(personPhone ? [personPhone] : []),
    ...((persons[0]?.phone) ?? []),
  ].filter(Boolean).map(normalizeNlPhone)));
  const allEmails = Array.from(new Set([
    ...(personEmail ? [personEmail] : []),
    ...((persons[0]?.email) ?? []),
  ].filter(Boolean)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[96vw] h-[92dvh] sm:rounded-2xl p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base leading-tight flex-1 truncate">
              {dealTitle || orgName || org?.name || 'Details'}
            </DialogTitle>
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
          {(dealValue != null || dealExpectedClose) && (
            <DialogDescription className="flex items-center gap-2 text-xs">
              {dealValue != null && (
                <>
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold text-primary">{formatCurrency(dealValue)}</span>
                </>
              )}
              {dealExpectedClose && (
                <span className="text-muted-foreground">· Verwacht {new Date(dealExpectedClose).toLocaleDateString('nl-NL')}</span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Inline Call Logger */}
        <div className="px-4 pb-2">
          <Collapsible open={showCallLogger} onOpenChange={setShowCallLogger}>
            <CollapsibleTrigger asChild>
              <Button className="w-full gap-2" size="sm" variant={showCallLogger ? 'outline' : 'default'}>
                <PhoneCall className="h-4 w-4" />
                {showCallLogger ? 'Verberg call logger' : 'Log call'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
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
        <div className="px-4 pb-2">
          <CallScriptSection contactName={personName || persons[0]?.name} branche={branche} />
        </div>

        <ScrollArea className="flex-1">
          <div className="px-4 pb-4 space-y-3">
            {/* Klant details — alles, kopieerbaar */}
            <section className="space-y-1.5">
              <h4 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Klant details
              </h4>
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {/* Bedrijf + status */}
                  <div className="flex items-center gap-1.5 sm:col-span-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm truncate">{orgName || org?.name || '—'}</span>
                    {status && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{status}</Badge>}
                  </div>

                  <CopyField label="Contact" value={personName} icon={<User className="h-3 w-3" />} />
                  <PlainField label="Branche" value={branche} icon={<Tag className="h-3 w-3" />} />

                  {allPhones.map((ph, i) => (
                    <CopyField
                      key={`ph-${i}`}
                      label={i === 0 ? 'Tel' : `Tel ${i + 1}`}
                      value={ph}
                      icon={<Phone className="h-3 w-3" />}
                      action={{ href: `tel:${ph}`, icon: <Phone className="h-3 w-3" />, title: 'Bel' }}
                    />
                  ))}

                  {allEmails.map((em, i) => (
                    <CopyField
                      key={`em-${i}`}
                      label={i === 0 ? 'Email' : `Email ${i + 1}`}
                      value={em}
                      icon={<Mail className="h-3 w-3" />}
                      action={{ href: `mailto:${em}`, icon: <Mail className="h-3 w-3" />, title: 'Stuur mail' }}
                    />
                  ))}

                  <CopyField
                    label="Website"
                    value={website}
                    icon={<Globe className="h-3 w-3" />}
                    action={{
                      href: website?.startsWith('http') ? website : `https://${website}`,
                      icon: <ExternalLink className="h-3 w-3" />,
                      title: 'Open website',
                    }}
                  />

                  <PlainField label="Productlijn" value={productLine} icon={<FileText className="h-3 w-3" />} />
                  <PlainField label="Adres" value={org?.address ?? null} icon={<MapPin className="h-3 w-3" />} />
                  {assignedAt && (
                    <PlainField
                      label="Toegewezen"
                      value={new Date(assignedAt).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}
                      icon={<Clock className="h-3 w-3" />}
                    />
                  )}
                  {dealValue != null && (
                    <PlainField label="Dealwaarde" value={formatCurrency(dealValue)} icon={<TrendingUp className="h-3 w-3" />} />
                  )}
                </div>

                {notes && (
                  <div className="flex items-start gap-1.5 text-xs pt-2 mt-2 border-t border-border/50">
                    <StickyNote className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="whitespace-pre-wrap text-foreground/90">{notes}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Calendly */}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> Afspraak inplannen
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] gap-1 px-2"
                  onClick={() => setShowCalendly(s => !s)}
                >
                  {showCalendly ? 'Verberg' : 'Toon planner'}
                </Button>
              </div>
              {showCalendly ? (
                <div className="rounded-lg border overflow-hidden bg-background">
                  <div ref={calendlyRef} style={{ minWidth: 320, height: 360 }} />
                  <div className="p-2 text-[11px] text-muted-foreground border-t bg-muted/20 flex items-center justify-between">
                    <span>Prefilled met {personName || 'klant'}{personEmail ? ` · ${personEmail}` : ''}</span>
                    <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Open in Calendly
                    </a>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCalendly(true)}
                  className="w-full rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-left"
                >
                  Klik om de planner te openen, automatisch ingevuld met de gegevens van deze klant.
                </button>
              )}
            </section>

            {/* Extra contactpersonen */}
            {persons.length > 1 && (
              <section className="space-y-1.5">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                  Overige contactpersonen ({persons.length - 1})
                </h4>
                <div className="space-y-1.5">
                  {persons.slice(1).map(p => (
                    <div key={p.id} className="rounded-lg border bg-muted/30 p-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-medium">{p.name}</span>
                        {p.job_title && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{p.job_title}</Badge>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 pl-4">
                        {p.phone.map((ph, i) => (
                          <CopyField
                            key={`pp-${i}`}
                            label={`Tel`}
                            value={ph}
                            icon={<Phone className="h-3 w-3" />}
                            action={{ href: `tel:${ph}`, icon: <Phone className="h-3 w-3" />, title: 'Bel' }}
                          />
                        ))}
                        {p.email.map((em, i) => (
                          <CopyField
                            key={`pe-${i}`}
                            label={`Email`}
                            value={em}
                            icon={<Mail className="h-3 w-3" />}
                            action={{ href: `mailto:${em}`, icon: <Mail className="h-3 w-3" />, title: 'Mail' }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            {/* Bel-historie */}
            <section className="space-y-1.5">
              <h4 className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                Bel-historie ({calls.length})
              </h4>
              {loading && calls.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Laden...
                </div>
              ) : calls.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nog geen calls gelogd voor deze lead.</p>
              ) : (
                <div className="space-y-1.5">
                  {calls.map(c => (
                    <div key={c.id} className="rounded-lg border p-2 space-y-1">
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
                        <ExpandableNote text={c.notes} title="Notitie call" icon="file" lineClamp={3} />
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
