import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Building2, User, Phone, Mail, Globe, Tag, StickyNote,
  PhoneCall, ExternalLink, Filter, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealDetailSheet } from '@/components/pipedrive/DealDetailSheet';
import { ExpandableNote } from '@/components/ui/expandable-note';

interface Lead {
  id: string;
  org_name: string | null;
  person_name: string | null;
  person_email: string | null;
  person_phone: string | null;
  website: string | null;
  branche: string | null;
  status: string;
  notes: string | null;
  deal_title: string | null;
  pipedrive_org_id: number | null;
  pipedrive_person_id: number | null;
  product_line: string | null;
  assigned_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  assigned: { label: 'Nieuw', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  contacted: { label: 'Gebeld', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  callback: { label: 'Terugbellen', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  no_answer: { label: 'Geen gehoor', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  interest: { label: 'Interesse', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  qualified: { label: 'Meeting', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  won: { label: 'Klant', className: 'bg-primary/15 text-primary border-primary/30' },
  lost: { label: 'Geen interesse', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  disqualified: { label: 'Gediskwalificeerd', className: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
};

const PAGE_SIZE = 50;

export default function SELeadsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [seId, setSeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBranche, setFilterBranche] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  // Resolve SE id
  useEffect(() => {
    if (!user) return;
    (async () => {
      const email = (user.email ?? '').trim().toLowerCase();
      const { data } = await supabase
        .from('sales_executives')
        .select('id')
        .or(`email.ilike.${email},user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();
      if (data) setSeId(data.id);
    })();
  }, [user]);

  // Fetch leads — paginate to bypass 1000-row default limit
  const fetchLeads = useCallback(async () => {
    if (!seId) return;
    const all: Lead[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('pipedrive_lead_assignments')
        .select('id, org_name, person_name, person_email, person_phone, website, branche, status, notes, deal_title, pipedrive_org_id, pipedrive_person_id, product_line, assigned_at')
        .eq('sales_executive_id', seId)
        .order('assigned_at', { ascending: false })
        .range(from, from + batchSize - 1);
      const batch = (data as Lead[]) || [];
      all.push(...batch);
      hasMore = batch.length === batchSize;
      from += batchSize;
    }
    setLeads(all);
    setLastSync(new Date());
    setLoading(false);
  }, [seId]);

  // Initial + 2-min polling + visibility
  useEffect(() => {
    if (!seId) return;
    fetchLeads();
    const interval = setInterval(fetchLeads, 2 * 60 * 1000);
    const handleVis = () => { if (document.visibilityState === 'visible') fetchLeads(); };
    document.addEventListener('visibilitychange', handleVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVis); };
  }, [fetchLeads, seId]);

  // Derived data
  const branches = useMemo(() => [...new Set(leads.map(l => l.branche).filter(Boolean))].sort() as string[], [leads]);
  const statuses = useMemo(() => [...new Set(leads.map(l => l.status))].sort(), [leads]);

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      if (filterBranche !== 'all' && l.branche !== filterBranche) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          l.org_name?.toLowerCase().includes(q) ||
          l.person_name?.toLowerCase().includes(q) ||
          l.person_email?.toLowerCase().includes(q) ||
          l.notes?.toLowerCase().includes(q) ||
          l.branche?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leads, filterStatus, filterBranche, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLeads = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedLead = selectedIdx !== null ? pageLeads[selectedIdx] ?? null : null;

  // Stats
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
    return counts;
  }, [leads]);

  const handleCallLead = (lead: Lead) => {
    const params = new URLSearchParams();
    if (lead.org_name) params.set('org', lead.org_name);
    if (lead.person_name) params.set('contact', lead.person_name);
    if (lead.person_phone) params.set('phone', lead.person_phone);
    params.set('lead', lead.id);
    navigate(`/calls?${params.toString()}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Leadlijst laden...</div>;
  }

  if (!seId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Geen SE-profiel gevonden.</div>;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mijn Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {leads.length} leads · Laatst gesynchroniseerd: {lastSync.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLeads} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Ververs
          </Button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statusCounts[key] || 0;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-center transition-all',
                  filterStatus === key ? cfg.className + ' ring-1 ring-current' : 'border-border/40 hover:border-border'
                )}
              >
                <div className="text-lg font-bold">{count}</div>
                <div className="text-[10px] leading-tight truncate">{cfg.label}</div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Zoek op bedrijf, contact, notities..."
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  {statuses.map(s => (
                    <SelectItem key={s} value={s}>
                      {STATUS_CONFIG[s]?.label || s} ({statusCounts[s] || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterBranche} onValueChange={v => { setFilterBranche(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Tag className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Branche" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle branches</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Lead table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">Geen leads gevonden</p>
                {leads.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Neem contact op met Robin om nieuwe leads toegewezen te krijgen.
                    </p>
                    <a href="tel:+31617226186">
                      <Button size="sm" className="gap-2">
                        <Phone className="h-4 w-4" />
                        Bel Robin (+31 6 17226186)
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bedrijf</TableHead>
                    <TableHead>Branche</TableHead>
                    <TableHead>Persoon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefoon</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notities</TableHead>
                    <TableHead className="w-[80px]">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageLeads.map((lead, idx) => {
                    const cfg = STATUS_CONFIG[lead.status] || { label: lead.status, className: '' };
                    return (
                      <TableRow
                        key={lead.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedIdx(idx)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm truncate max-w-[180px]">{lead.org_name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {lead.branche && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal truncate max-w-[120px]">
                              {lead.branche}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm truncate block max-w-[140px]">{lead.person_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          {lead.person_email && (
                            <a
                              href={`mailto:${lead.person_email}`}
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate max-w-[180px]"
                            >
                              <Mail className="h-3 w-3 shrink-0" />
                              {lead.person_email}
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.person_phone && (
                            <a
                              href={`tel:${lead.person_phone}`}
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            >
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[120px]">{lead.person_phone}</span>
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          {lead.website && (
                            <a
                              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                            >
                              <Globe className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[120px]">
                                {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                              </span>
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cfg.className)}>
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lead.notes && (
                            <div className="max-w-[200px]">
                              <ExpandableNote text={lead.notes} title={`Notitie — ${lead.org_name || 'Lead'}`} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => { e.stopPropagation(); handleCallLead(lead); }}
                          >
                            <PhoneCall className="h-3.5 w-3.5 mr-1" />
                            Bel
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} van {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Lead detail sheet */}
      <DealDetailSheet
        open={!!selectedLead}
        onOpenChange={(open) => { if (!open) { setSelectedIdx(null); fetchLeads(); } }}
        dealTitle={selectedLead?.deal_title ?? selectedLead?.org_name ?? undefined}
        orgId={selectedLead?.pipedrive_org_id}
        personId={selectedLead?.pipedrive_person_id}
        leadAssignmentId={selectedLead?.id}
        orgName={selectedLead?.org_name}
        personName={selectedLead?.person_name}
        personPhone={selectedLead?.person_phone}
        branche={selectedLead?.branche}
        onPrev={selectedIdx !== null && selectedIdx > 0 ? () => setSelectedIdx(selectedIdx - 1) : null}
        onNext={selectedIdx !== null && selectedIdx < pageLeads.length - 1 ? () => setSelectedIdx(selectedIdx + 1) : null}
      />
    </>
  );
}
