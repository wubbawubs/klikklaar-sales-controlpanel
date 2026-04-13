import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, User, Phone, Mail, Clock, FileText, Loader2, MapPin, TrendingUp, Calendar, ChevronLeft, ChevronRight, PhoneCall } from 'lucide-react';
import { CallScriptSection } from './CallScriptSection';
import { InlineCallLogger } from './InlineCallLogger';
import { ExpandableNote } from '@/components/ui/expandable-note';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  branche?: string | null;
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

interface Activity {
  id: number;
  type: string;
  subject: string;
  note: string | null;
  done: boolean;
  due_date: string | null;
  person_name: string | null;
  org_name: string | null;
  add_time: string;
}

const headers = {
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};
const BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export function DealDetailSheet({ open, onOpenChange, dealTitle, dealValue, dealExpectedClose, orgId, personId, leadAssignmentId, orgName, personName, personPhone, branche, onPrev, onNext }: DealDetailSheetProps) {
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showCallLogger, setShowCallLogger] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    Promise.all([
      fetch(`${BASE}/pipedrive-organizations?org_id=${orgId}`, { headers }).then(r => r.json()),
      fetch(`${BASE}/pipedrive-activities?org_id=${orgId}&limit=10`, { headers }).then(r => r.json()),
    ])
      .then(([orgData, actData]) => {
        setOrg(orgData.organization || null);
        setPersons(orgData.persons || []);
        setActivities(actData.activities || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, orgId]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[100vw] h-[100dvh] sm:w-[95vw] sm:h-auto sm:max-h-[85vh] sm:rounded-2xl rounded-none p-0 flex flex-col gap-0">
        <DialogHeader className="p-5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base leading-tight flex-1">{dealTitle || org?.name || 'Details'}</DialogTitle>
            {(onPrev || onNext) && (
              <div className="flex items-center gap-1 shrink-0">
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

        {/* Log Call CTA */}
        <div className="px-5 pb-2">
          <Button onClick={handleLogCall} className="w-full gap-2" size="sm">
            <PhoneCall className="h-4 w-4" />
            Log call
          </Button>
        </div>

        {/* Call Script */}
        <div className="px-5 pb-2">
          <CallScriptSection contactName={personName || persons[0]?.name} branche={branche} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-5 pb-5 space-y-5">
              {/* Organization */}
              {org && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Organisatie</h4>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{org.name}</span>
                    </div>
                    {org.address && (
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{org.address}</span>
                      </div>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{org.open_deals_count} open</span>
                      <span>{org.won_deals_count} gewonnen</span>
                      <span>{org.lost_deals_count} verloren</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Contacts */}
              {persons.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Contactpersonen ({persons.length})</h4>
                  <div className="space-y-2">
                    {persons.map(p => (
                      <div key={p.id} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{p.name}</span>
                          {p.job_title && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{p.job_title}</Badge>}
                        </div>
                        {p.phone.length > 0 && p.phone.map((ph, i) => (
                          <a key={i} href={`tel:${ph}`} className="flex items-center gap-2 text-xs text-primary hover:underline">
                            <Phone className="h-3 w-3" />{ph}
                          </a>
                        ))}
                        {p.email.length > 0 && p.email.map((em, i) => (
                          <a key={i} href={`mailto:${em}`} className="flex items-center gap-2 text-xs text-primary hover:underline">
                            <Mail className="h-3 w-3" />{em}
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <Separator />

              {/* Activities */}
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Laatste activiteiten ({activities.length})</h4>
                {activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Geen activiteiten gevonden</p>
                ) : (
                  <div className="space-y-2">
                    {activities.map(act => (
                      <div key={act.id} className="rounded-lg border p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${act.done ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                              {act.done ? '✓' : '○'}
                            </div>
                            <span className="text-sm font-medium truncate max-w-[200px]">{act.subject}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">{act.type}</Badge>
                        </div>
                        {act.note && (
                          <div className="ml-7">
                            <ExpandableNote
                              text={act.note}
                              title={`Notitie — ${act.subject || 'Activiteit'}`}
                              icon="file"
                              lineClamp={3}
                              stripHtml
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2 ml-7 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {act.due_date || new Date(act.add_time).toLocaleDateString('nl-NL')}
                          {act.person_name && <span>· {act.person_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
