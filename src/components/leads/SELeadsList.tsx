import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, Building2, Phone, Tag,
  Filter, RefreshCw, ChevronLeft, ChevronRight, Keyboard, Snowflake,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadDetailSheet } from '@/components/leads/LeadDetailSheet';
import { DailyActivityBar } from './DailyActivityBar';
import { AttemptIndicator, type AttemptOutcome } from './AttemptIndicator';
import { CallbackDialog, NoteDialog, logQuickCall, type QuickLead, type QuickOutcome } from './QuickCallActions';
import { PhoneCell, WebsiteCell } from './ContactCells';
import { LeadNoteButton } from './LeadNoteButton';
import { toast } from 'sonner';

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
  product_line: string | null;
  assigned_at: string | null;
}

interface CallStat {
  attempts: number; // count of not_reached
  lastOutcome: AttemptOutcome;
  lastCallAt: string | null;
  nextCallback: string | null;
}

const PAGE_SIZE = 50;

type QuickFilter = 'all' | 'untouched' | 'callbacks_today' | 'tried_2x' | 'cold' | 'reached';
type SourceFilter = 'all' | 'pipedrive' | 'scraped';
type SortKey = 'org' | 'phone' | 'last_action' | 'branche' | 'assigned' | 'status';
type SortDir = 'asc' | 'desc';

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'untouched', label: 'Niet gebeld' },
  { id: 'callbacks_today', label: 'Callbacks vandaag' },
  { id: 'tried_2x', label: '2× geprobeerd' },
  { id: 'cold', label: 'Cold (3×)' },
  { id: 'reached', label: 'Bereikt' },
];

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'Alle bronnen' },
  { id: 'pipedrive', label: 'Pipedrive' },
  { id: 'scraped', label: 'Scraped' },
];

export default function SELeadsList() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') as QuickFilter | null;
  const validInitial: QuickFilter = initialFilter && QUICK_FILTERS.some(f => f.id === initialFilter) ? initialFilter : 'all';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [callStats, setCallStats] = useState<Record<string, CallStat>>({});
  const [loading, setLoading] = useState(true);
  const [seId, setSeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterBranche, setFilterBranche] = useState('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(validInitial);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('assigned');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number>(0);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [activityRefresh, setActivityRefresh] = useState(0);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [pendingLead, setPendingLead] = useState<QuickLead | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return key;
    });
    setPage(0);
  }, []);

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

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    if (!seId) return;
    const all: Lead[] = [];
    const batchSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('lead_assignments')
        .select('id, org_name, person_name, person_email, person_phone, website, branche, status, notes, deal_title, product_line, assigned_at')
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

  // Fetch call stats per lead
  const fetchCallStats = useCallback(async () => {
    if (!seId) return;
    const all: any[] = [];
    let from = 0;
    const ps = 1000;
    while (true) {
      const { data } = await supabase
        .from('calls')
        .select('lead_assignment_id, outcome, created_at, callback_date, callback_time')
        .eq('sales_executive_id', seId)
        .order('created_at', { ascending: true })
        .range(from, from + ps - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < ps) break;
      from += ps;
    }
    const map: Record<string, CallStat> = {};
    for (const c of all) {
      if (!c.lead_assignment_id) continue;
      const cur = map[c.lead_assignment_id] ?? { attempts: 0, lastOutcome: null, lastCallAt: null, nextCallback: null };
      if (c.outcome === 'not_reached') cur.attempts += 1;
      cur.lastOutcome = c.outcome as AttemptOutcome;
      cur.lastCallAt = c.created_at;
      if (c.callback_date) {
        cur.nextCallback = c.callback_time
          ? `${c.callback_date}T${c.callback_time}`
          : c.callback_date;
      }
      map[c.lead_assignment_id] = cur;
    }
    setCallStats(map);
  }, [seId]);

  useEffect(() => {
    if (!seId) return;
    fetchLeads();
    fetchCallStats();
    const interval = setInterval(() => { fetchLeads(); fetchCallStats(); }, 2 * 60 * 1000);
    const handleVis = () => { if (document.visibilityState === 'visible') { fetchLeads(); fetchCallStats(); } };
    document.addEventListener('visibilitychange', handleVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVis); };
  }, [fetchLeads, fetchCallStats, seId]);

  // Derived
  const branches = useMemo(() => [...new Set(leads.map(l => l.branche).filter(Boolean))].sort() as string[], [leads]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const list = leads.filter(l => {
      // Always hide "Geen interesse" (lost) — those live in Mail Export tab
      if (l.status === 'lost') return false;

      const stat = callStats[l.id];
      const attempts = stat?.attempts ?? 0;
      const reached = stat?.lastOutcome && stat.lastOutcome !== 'not_reached';

      if (quickFilter === 'untouched' && (stat?.lastCallAt)) return false;
      if (quickFilter === 'callbacks_today') {
        if (!stat?.nextCallback || !stat.nextCallback.startsWith(todayStr)) return false;
      }
      if (quickFilter === 'tried_2x' && attempts !== 2) return false;
      if (quickFilter === 'cold' && attempts < 3) return false;
      if (quickFilter === 'reached' && !reached) return false;

      // Source filter not relevant zonder Pipedrive
      if (sourceFilter === 'pipedrive') return false;

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

    // Sorting
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: string | number | null | undefined, b: string | number | null | undefined) => {
      const av = a ?? '';
      const bv = b ?? '';
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    };
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'org': return cmp(a.org_name?.toLowerCase(), b.org_name?.toLowerCase());
        case 'phone': return cmp(a.person_phone ?? '', b.person_phone ?? '');
        case 'branche': return cmp(a.branche?.toLowerCase() ?? '', b.branche?.toLowerCase() ?? '');
        case 'status': return cmp(a.status, b.status);
        case 'last_action': {
          const al = callStats[a.id]?.lastCallAt ?? '';
          const bl = callStats[b.id]?.lastCallAt ?? '';
          return cmp(al, bl);
        }
        case 'assigned':
        default:
          return cmp(a.assigned_at ?? '', b.assigned_at ?? '');
      }
    });
    return sorted;
  }, [leads, callStats, filterBranche, search, quickFilter, sourceFilter, sortKey, sortDir, todayStr]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLeads = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const detailLead = detailIdx !== null ? pageLeads[detailIdx] ?? null : null;

  const sourceCounts = useMemo(() => {
    const total = leads.filter(l => l.status !== 'lost').length;
    return { all: total, pipedrive: 0, scraped: total };
  }, [leads]);

  // Quick filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<QuickFilter, number> = {
      all: leads.length, untouched: 0, callbacks_today: 0, tried_2x: 0, cold: 0, reached: 0,
    };
    for (const l of leads) {
      const s = callStats[l.id];
      const a = s?.attempts ?? 0;
      if (!s?.lastCallAt) counts.untouched++;
      if (s?.nextCallback?.startsWith(todayStr)) counts.callbacks_today++;
      if (a === 2) counts.tried_2x++;
      if (a >= 3) counts.cold++;
      if (s?.lastOutcome && s.lastOutcome !== 'not_reached') counts.reached++;
    }
    return counts;
  }, [leads, callStats, todayStr]);




  // Quick action runner
  const runQuickAction = useCallback(async (lead: Lead, outcome: QuickOutcome, opts?: { date?: string; time?: string; note?: string }) => {
    if (!seId) return;
    const attemptsBefore = callStats[lead.id]?.attempts ?? 0;
    const res = await logQuickCall({
      seId,
      lead: { id: lead.id, org_name: lead.org_name, person_name: lead.person_name, person_phone: lead.person_phone, status: lead.status },
      outcome,
      callbackDate: opts?.date ?? null,
      callbackTime: opts?.time ?? null,
      notes: opts?.note ?? null,
      attemptsBefore,
    });
    if (res.ok) {
      const labels: Record<QuickOutcome, string> = {
        not_reached: 'Geen gehoor',
        callback: 'Callback',
        interest: 'Interesse',
        appointment: 'Afspraak',
        deal: 'Deal',
        no_interest: 'Geen interesse',
        invalid_number: 'Ongeldig nummer',
      };
      toast.success(`${labels[outcome]} • ${lead.org_name ?? 'Lead'}${res.planned ? ` · terugbellen ${res.planned}` : ''}`);
      fetchCallStats();
      fetchLeads();
      setActivityRefresh(k => k + 1);

      // Move focus to next row's phone cell (Excel-style flow)
      requestAnimationFrame(() => {
        const nextIdx = selectedRowIdx + 1;
        if (nextIdx < pageLeads.length) {
          setSelectedRowIdx(nextIdx);
          const rows = tableRef.current?.querySelectorAll('tbody tr');
          const nextPhone = rows?.[nextIdx]?.querySelector<HTMLElement>('[data-phone-cell]');
          nextPhone?.focus();
        }
      });
    }
  }, [seId, callStats, fetchCallStats, fetchLeads]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/dialogs
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return;
      if (callbackOpen || noteOpen || detailIdx !== null) return;

      const lead = pageLeads[selectedRowIdx];
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedRowIdx(i => Math.min(pageLeads.length - 1, i + 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedRowIdx(i => Math.max(0, i - 1)); return; }
      if (!lead) return;
      if (e.key === 'Enter') { e.preventDefault(); setDetailIdx(selectedRowIdx); return; }

      const asQuick: QuickLead = { id: lead.id, org_name: lead.org_name, person_name: lead.person_name, person_phone: lead.person_phone, status: lead.status };

      switch (e.key) {
        case '1': e.preventDefault(); runQuickAction(lead, 'not_reached'); break;
        case '2': e.preventDefault(); setPendingLead(asQuick); setCallbackOpen(true); break;
        case '3': e.preventDefault(); runQuickAction(lead, 'interest'); break;
        case '4': e.preventDefault(); runQuickAction(lead, 'appointment'); break;
        case '5': e.preventDefault(); runQuickAction(lead, 'deal'); break;
        case '6': e.preventDefault(); runQuickAction(lead, 'no_interest'); break;
        case '7': e.preventDefault(); runQuickAction(lead, 'invalid_number'); break;
        case 'm': case 'M':
          if (lead.person_email) { e.preventDefault(); window.location.href = `mailto:${lead.person_email}`; }
          break;
        case 'n': case 'N':
          e.preventDefault(); setPendingLead(asQuick); setNoteOpen(true); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageLeads, selectedRowIdx, runQuickAction, callbackOpen, noteOpen, detailIdx]);

  // Reset selection when page changes
  useEffect(() => { setSelectedRowIdx(0); }, [page, quickFilter, filterBranche, search, sourceFilter, sortKey, sortDir]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Leadlijst laden...</div>;
  }

  if (!seId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Geen SE-profiel gevonden.</div>;
  }

  const formatLastAction = (stat?: CallStat) => {
    if (!stat?.lastCallAt) return null;
    const d = new Date(stat.lastCallAt);
    const isToday = d.toISOString().slice(0, 10) === todayStr;
    return isToday
      ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  };

  const formatCallback = (stat?: CallStat) => {
    if (!stat?.nextCallback) return null;
    const d = new Date(stat.nextCallback.length > 10 ? stat.nextCallback : stat.nextCallback + 'T09:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const diff = (dayStart.getTime() - today.getTime()) / 86400000;
    const time = stat.nextCallback.length > 10 ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
    if (diff === 0) return `Vandaag ${time}`.trim();
    if (diff === 1) return `Morgen ${time}`.trim();
    if (diff < 0) return `Achterstallig (${d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })})`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) + (time ? ' ' + time : '');
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Mijn Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {leads.length} leads · Sync: {lastSync.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowShortcuts(s => !s)} className="gap-2">
              <Keyboard className="h-3.5 w-3.5" /> Sneltoetsen
            </Button>
            <Button variant="outline" size="sm" onClick={() => { fetchLeads(); fetchCallStats(); }} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Ververs
            </Button>
          </div>
        </div>

        {/* Daily activity */}
        <DailyActivityBar seId={seId} refreshKey={activityRefresh} />

        {/* Shortcut cheatsheet */}
        {showShortcuts && (
          <Card className="bg-muted/30">
            <CardContent className="p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">↑↓</kbd> Navigeer</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">Enter</kbd> Open</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">1</kbd> Geen gehoor (auto +1 wd)</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">2</kbd> Callback</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">3</kbd> Interesse</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">4</kbd> Afspraak</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">5</kbd> Deal</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">6</kbd> Geen interesse</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">7</kbd> Ongeldig nummer</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">M</kbd> Mail</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">N</kbd> Notitie</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">Tab</kbd> Telefoon → Website → volgende rij</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-background">⌘B</kbd> Sidebar</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick filters */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => { setQuickFilter(f.id); setPage(0); }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors',
                quickFilter === f.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              {f.id === 'cold' && <Snowflake className="h-3 w-3" />}
              {f.label}
              <span className="font-mono opacity-70">{filterCounts[f.id]}</span>
            </button>
          ))}
        </div>

        {/* Source filter (Pipedrive vs Scraped) */}
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => { setSourceFilter(f.id); setPage(0); }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors',
                sourceFilter === f.id
                  ? 'bg-secondary text-secondary-foreground border-secondary'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              {f.label}
              <span className="font-mono opacity-70">{sourceCounts[f.id]}</span>
            </button>
          ))}
        </div>

        {/* Search/branche filter */}
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
          <CardContent className="p-0 overflow-x-auto" ref={tableRef}>
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
                    <SortableHead label="Status" sortKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Bedrijf" sortKey="org" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Telefoon" sortKey="phone" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <TableHead className="whitespace-nowrap px-4">Website</TableHead>
                    <SortableHead label="Laatste actie" sortKey="last_action" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Branche" sortKey="branche" current={sortKey} dir={sortDir} onClick={toggleSort} />
                    <TableHead className="whitespace-nowrap px-4 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageLeads.map((lead, idx) => {
                    const stat = callStats[lead.id];
                    const isSelected = idx === selectedRowIdx;
                    return (
                      <TableRow
                        key={lead.id}
                        className={cn(
                          'cursor-pointer',
                          isSelected && 'bg-muted/40',
                        )}
                        onClick={() => setSelectedRowIdx(idx)}
                        onDoubleClick={() => setDetailIdx(idx)}
                      >
                        <TableCell className="px-4">
                          <AttemptIndicator
                            attempts={stat?.attempts ?? 0}
                            lastOutcome={stat?.lastOutcome ?? null}
                          />
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm truncate">{lead.org_name || ','}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 whitespace-nowrap">
                          <PhoneCell phone={lead.person_phone} />
                        </TableCell>
                        <TableCell className="px-4 whitespace-nowrap">
                          <WebsiteCell website={lead.website} />
                        </TableCell>
                        <TableCell className="px-4 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">{formatLastAction(stat) ?? ','}</span>
                        </TableCell>
                        <TableCell className="px-4">
                          {lead.branche && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal truncate max-w-[140px]">
                              {lead.branche}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-2 w-10" onClick={(e) => e.stopPropagation()}>
                          {seId && <LeadNoteButton leadAssignmentId={lead.id} salesExecutiveId={seId} />}
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

        <p className="text-[11px] text-muted-foreground text-center">
          Tip: druk op <kbd className="px-1 py-0.5 rounded border border-border/60 bg-muted">?</kbd> voor sneltoetsen ·
          <kbd className="px-1 py-0.5 rounded border border-border/60 bg-muted ml-1">⌘B</kbd> verbergt de zijbalk
        </p>
      </div>

      {/* Callback dialog */}
      <CallbackDialog
        open={callbackOpen}
        onOpenChange={setCallbackOpen}
        lead={pendingLead}
        onConfirm={(date, time, note) => {
          const lead = leads.find(l => l.id === pendingLead?.id);
          if (lead) runQuickAction(lead, 'callback', { date, time, note });
        }}
      />

      {/* Note dialog (logs as not_reached + notes — keeps history light) */}
      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        lead={pendingLead}
        onConfirm={async (note) => {
          if (!pendingLead || !seId) return;
          await supabase
            .from('lead_assignments')
            .update({ notes: note, updated_at: new Date().toISOString() })
            .eq('id', pendingLead.id);
          toast.success('Notitie opgeslagen');
          fetchLeads();
        }}
      />

      {/* Lead detail sheet */}
      <LeadDetailSheet
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) { setDetailIdx(null); fetchLeads(); fetchCallStats(); } }}
        dealTitle={detailLead?.deal_title ?? detailLead?.org_name ?? undefined}
        assignedAt={detailLead?.assigned_at ?? null}
        leadAssignmentId={detailLead?.id}
        orgName={detailLead?.org_name}
        personName={detailLead?.person_name}
        personPhone={detailLead?.person_phone}
        personEmail={detailLead?.person_email}
        website={detailLead?.website}
        branche={detailLead?.branche}
        productLine={detailLead?.product_line}
        notes={detailLead?.notes}
        status={detailLead?.status}
        onPrev={detailIdx !== null && detailIdx > 0 ? () => setDetailIdx(detailIdx - 1) : null}
        onNext={detailIdx !== null && detailIdx < pageLeads.length - 1 ? () => setDetailIdx(detailIdx + 1) : null}
      />
    </>
  );
}

function SortableHead({
  label, sortKey, current, dir, onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className="whitespace-nowrap px-4">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 -mx-1 px-1 rounded hover:text-foreground transition-colors',
          active ? 'text-foreground font-medium' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} />
      </button>
    </TableHead>
  );
}
