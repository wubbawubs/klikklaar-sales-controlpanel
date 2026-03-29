import { useState, useEffect, useCallback } from 'react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Building2, User, Phone, Mail, Loader2, ChevronDown, ChevronRight, X } from 'lucide-react';

interface PipedriveOrg {
  id: number;
  name: string;
  address?: string;
  owner_name?: string;
  people_count?: number;
  open_deals_count?: number;
}

interface PipedrivePerson {
  id: number;
  name: string;
  email: string[];
  phone: string[];
  job_title?: string;
  org_id?: number;
}

export interface SelectedLead {
  pipedrive_org_id: number;
  pipedrive_person_id?: number;
  org_name: string;
  person_name?: string;
  person_email?: string;
  person_phone?: string;
}

interface Props {
  selectedLeads: SelectedLead[];
  onSelectionChange: (leads: SelectedLead[]) => void;
}

export default function PipedriveLeadSelector({ selectedLeads, onSelectionChange }: Props) {
  const [search, setSearch] = useState('');
  const [orgs, setOrgs] = useState<PipedriveOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<number | null>(null);
  const [persons, setPersons] = useState<Record<number, PipedrivePerson[]>>({});
  const [loadingPersons, setLoadingPersons] = useState<number | null>(null);

  const PAGE_SIZE = 100;

  const fetchOrgs = useCallback(async (term: string, start = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), start: String(start) });
      if (term) params.set('search', term);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-organizations?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const newOrgs = result.organizations || [];
      setOrgs(prev => append ? [...prev, ...newOrgs] : newOrgs);
      setHasMore(result.has_more || false);
    } catch (err) {
      console.error('Failed to fetch orgs:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs('');
  }, [fetchOrgs]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrgs(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchOrgs]);

  const fetchPersons = async (orgId: number) => {
    if (persons[orgId]) return;
    setLoadingPersons(orgId);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-persons?org_id=${orgId}`,
        { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const result = await res.json();
      setPersons(prev => ({ ...prev, [orgId]: result.persons || [] }));
    } catch (err) {
      console.error('Failed to fetch persons:', err);
    } finally {
      setLoadingPersons(null);
    }
  };

  const toggleOrg = (orgId: number) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
    } else {
      setExpandedOrg(orgId);
      fetchPersons(orgId);
    }
  };

  const isOrgSelected = (orgId: number) => selectedLeads.some(l => l.pipedrive_org_id === orgId);

  const toggleOrgSelection = (org: PipedriveOrg) => {
    if (isOrgSelected(org.id)) {
      onSelectionChange(selectedLeads.filter(l => l.pipedrive_org_id !== org.id));
    } else {
      // Add org with all known persons
      const orgPersons = persons[org.id] || [];
      if (orgPersons.length > 0) {
        const newLeads = orgPersons.map(p => ({
          pipedrive_org_id: org.id,
          pipedrive_person_id: p.id,
          org_name: org.name,
          person_name: p.name,
          person_email: p.email[0] || undefined,
          person_phone: p.phone[0] || undefined,
        }));
        onSelectionChange([...selectedLeads.filter(l => l.pipedrive_org_id !== org.id), ...newLeads]);
      } else {
        onSelectionChange([...selectedLeads, {
          pipedrive_org_id: org.id,
          org_name: org.name,
        }]);
      }
    }
  };

  const isPersonSelected = (orgId: number, personId: number) =>
    selectedLeads.some(l => l.pipedrive_org_id === orgId && l.pipedrive_person_id === personId);

  const togglePersonSelection = (org: PipedriveOrg, person: PipedrivePerson) => {
    if (isPersonSelected(org.id, person.id)) {
      onSelectionChange(selectedLeads.filter(l => !(l.pipedrive_org_id === org.id && l.pipedrive_person_id === person.id)));
    } else {
      onSelectionChange([...selectedLeads, {
        pipedrive_org_id: org.id,
        pipedrive_person_id: person.id,
        org_name: org.name,
        person_name: person.name,
        person_email: person.email[0] || undefined,
        person_phone: person.phone[0] || undefined,
      }]);
    }
  };

  const removeSelected = (lead: SelectedLead) => {
    onSelectionChange(selectedLeads.filter(l => l !== lead));
  };

  return (
    <div className="space-y-4">
      {/* Selected leads summary */}
      {selectedLeads.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} geselecteerd
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedLeads.map((lead, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pr-1">
                <Building2 className="h-3 w-3" />
                {lead.org_name}
                {lead.person_name && <span className="text-muted-foreground">• {lead.person_name}</span>}
                <button onClick={() => removeSelected(lead)} className="ml-1 rounded-full p-0.5 hover:bg-muted">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek organisaties in Pipedrive..."
          className="pl-10"
        />
      </div>

      {/* Organization list */}
      <ScrollArea className="h-[400px] border rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Pipedrive data laden...</span>
          </div>
        ) : orgs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {search ? 'Geen organisaties gevonden' : 'Geen organisaties beschikbaar'}
          </div>
        ) : (
          <div className="divide-y">
            {orgs.map(org => (
              <div key={org.id}>
                <div className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={isOrgSelected(org.id)}
                    onCheckedChange={() => toggleOrgSelection(org)}
                  />
                  <button
                    onClick={() => toggleOrg(org.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{org.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {org.people_count !== undefined && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />{org.people_count} contacten
                          </span>
                        )}
                        {org.open_deals_count !== undefined && org.open_deals_count > 0 && (
                          <span>{org.open_deals_count} open deals</span>
                        )}
                        {org.owner_name && <span>Eigenaar: {org.owner_name}</span>}
                      </div>
                    </div>
                    {expandedOrg === org.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>

                {/* Expanded persons */}
                {expandedOrg === org.id && (
                  <div className="bg-muted/30 border-t">
                    {loadingPersons === org.id ? (
                      <div className="flex items-center gap-2 p-3 pl-12">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Contactpersonen laden...</span>
                      </div>
                    ) : (persons[org.id] || []).length === 0 ? (
                      <div className="p-3 pl-12 text-sm text-muted-foreground">Geen contactpersonen gevonden</div>
                    ) : (
                      (persons[org.id] || []).map(person => (
                        <div key={person.id} className="flex items-center gap-3 p-3 pl-12 hover:bg-muted/50 transition-colors">
                          <Checkbox
                            checked={isPersonSelected(org.id, person.id)}
                            onCheckedChange={() => togglePersonSelection(org, person)}
                          />
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{person.name}</p>
                            {person.job_title && <p className="text-xs text-muted-foreground">{person.job_title}</p>}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              {person.email[0] && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />{person.email[0]}
                                </span>
                              )}
                              {person.phone[0] && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />{person.phone[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
            {hasMore && (
              <div className="p-3 text-center border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchOrgs(search, orgs.length, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Laden...
                    </>
                  ) : (
                    `Meer organisaties laden`
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
