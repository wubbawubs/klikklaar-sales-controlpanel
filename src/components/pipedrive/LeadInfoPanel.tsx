import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, User, Phone, Mail, Clock, FileText, Loader2, MapPin, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

interface LeadInfoPanelProps {
  orgId: number | null;
  personId?: number | null;
  orgName?: string | null;
}

const headers = {
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};
const BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export function LeadInfoPanel({ orgId, orgName }: LeadInfoPanelProps) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [org, setOrg] = useState<any>(null);
  const [persons, setPersons] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([
      fetch(`${BASE}/pipedrive-organizations?org_id=${orgId}`, { headers }).then(r => r.json()),
      fetch(`${BASE}/pipedrive-activities?org_id=${orgId}&limit=5`, { headers }).then(r => r.json()),
    ])
      .then(([orgData, actData]) => {
        setOrg(orgData.organization || null);
        setPersons(orgData.persons || []);
        setActivities(actData.activities || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  if (!orgId) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{orgName || org?.name || 'Laden...'}</span>
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>

        {expanded && !loading && (
          <div className="space-y-3">
            {/* Org details */}
            {org && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {org.address && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{org.address}</span>
                )}
                <span>{org.open_deals_count} open deals</span>
                <span>{org.won_deals_count} gewonnen</span>
              </div>
            )}

            {/* Contacts */}
            {persons.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">Contacten</p>
                <div className="grid gap-1.5">
                  {persons.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-3 bg-background rounded-md px-2.5 py-1.5 border text-xs">
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{p.name}</span>
                      {p.phone?.[0] && (
                        <a href={`tel:${p.phone[0]}`} className="text-primary hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" />{p.phone[0]}
                        </a>
                      )}
                      {p.email?.[0] && (
                        <a href={`mailto:${p.email[0]}`} className="text-primary hover:underline flex items-center gap-1">
                          <Mail className="h-3 w-3" />{p.email[0]}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activities */}
            {activities.length > 0 && (
              <div className="space-y-1.5">
                <Separator />
                <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">Laatste notities</p>
                <div className="space-y-1">
                  {activities.map((act: any) => (
                    <div key={act.id} className="flex items-start gap-2 text-xs">
                      <div className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px] shrink-0 ${act.done ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                        {act.done ? '✓' : '○'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{act.subject}</span>
                        {act.note && (
                          <p className="text-muted-foreground line-clamp-2 mt-0.5">{act.note.replace(/<[^>]*>/g, '')}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {act.due_date || new Date(act.add_time).toLocaleDateString('nl-NL')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
