import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, ArrowRightLeft, Building2, User, Phone, Mail, Filter, ChevronDown, ChevronRight, PhoneCall } from 'lucide-react';
import BulkLeadImport from '@/components/leads/BulkLeadImport';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { SalesExecutive } from '@/types/database';
import LeadActivityHistory from '@/components/leads/LeadActivityHistory';
import SELeadsList from '@/components/leads/SELeadsList';

interface LeadAssignment {
  id: string;
  sales_executive_id: string;
  pipedrive_org_id: number | null;
  pipedrive_person_id: number | null;
  org_name: string | null;
  person_name: string | null;
  person_email: string | null;
  person_phone: string | null;
  deal_title: string | null;
  status: string;
  assigned_at: string | null;
  product_line: string | null;
  notes: string | null;
}

const statusColors: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  contacted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  qualified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  proposal: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  lost: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function LeadManagementPage() {
  const { isAdmin, roles } = useAuth();
  const isCoachOrAdmin = isAdmin || roles.includes('coach');

  // SE's see their own lead list
  if (!isCoachOrAdmin) {
    return <SELeadsList />;
  }

  return <AdminLeadManagement />;
}

function AdminLeadManagement() {
  const [leads, setLeads] = useState<LeadAssignment[]>([]);
  const [ses, setSes] = useState<SalesExecutive[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSe, setFilterSe] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [targetSeId, setTargetSeId] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set());
  const [activityCounts, setActivityCounts] = useState<Record<string, number>>({});

  const fetchData = async () => {
    setLoading(true);

    // Fetch all leads with pagination (Supabase caps at 1000 per query)
    const fetchAllLeads = async () => {
      const all: LeadAssignment[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('pipedrive_lead_assignments')
          .select('*')
          .order('assigned_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    };

    const fetchAllActivities = async () => {
      const all: { lead_assignment_id: string | null }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('pipedrive_activities')
          .select('lead_assignment_id')
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    };

    const [allLeads, sesRes, allActivities] = await Promise.all([
      fetchAllLeads(),
      supabase.from('sales_executives').select('*').order('full_name'),
      fetchAllActivities(),
    ]);
    setLeads(allLeads);
    setSes(sesRes.data || []);
    
    // Count activities per lead
    const counts: Record<string, number> = {};
    allActivities.forEach((a) => {
      if (a.lead_assignment_id) {
        counts[a.lead_assignment_id] = (counts[a.lead_assignment_id] || 0) + 1;
      }
    });
    setActivityCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const seMap = Object.fromEntries(ses.map(se => [se.id, se]));

  const filtered = leads.filter(l => {
    if (filterSe !== 'all' && l.sales_executive_id !== filterSe) return false;
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.org_name?.toLowerCase().includes(q) ||
        l.person_name?.toLowerCase().includes(q) ||
        l.person_email?.toLowerCase().includes(q) ||
        seMap[l.sales_executive_id]?.full_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLeads.size === filtered.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filtered.map(l => l.id)));
    }
  };

  const handleReassign = async () => {
    if (!targetSeId || selectedLeads.size === 0) return;
    setReassigning(true);
    const { error } = await supabase
      .from('pipedrive_lead_assignments')
      .update({ sales_executive_id: targetSeId, updated_at: new Date().toISOString() })
      .in('id', Array.from(selectedLeads));

    if (error) {
      toast.error('Herverdeling mislukt: ' + error.message);
    } else {
      toast.success(`${selectedLeads.size} lead(s) herverdeeld naar ${seMap[targetSeId]?.full_name}`);
      setSelectedLeads(new Set());
      setReassignDialogOpen(false);
      setTargetSeId('');
      fetchData();
    }
    setReassigning(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedLeads(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const uniqueStatuses = [...new Set(leads.map(l => l.status))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Lead Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Beheer en herverdeel Pipedrive leads tussen sales executives
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BulkLeadImport ses={ses} onImported={fetchData} />
          {selectedLeads.size > 0 && (
            <Button onClick={() => setReassignDialogOpen(true)} className="w-full sm:w-auto">
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Herverdeel ({selectedLeads.size})
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Zoek op organisatie, contact of SE..."
                className="pl-9"
              />
            </div>
            <Select value={filterSe} onValueChange={setFilterSe}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sales Executive" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle SE's</SelectItem>
                {ses.map(se => (
                  <SelectItem key={se.id} value={se.id}>{se.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {uniqueStatuses.map(s => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Totaal leads</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{leads.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Toegewezen</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{leads.filter(l => l.status === 'assigned').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Gecontacteerd</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{leads.filter(l => l.status === 'contacted').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Gekwalificeerd</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{leads.filter(l => l.status === 'qualified').length}</p></CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Laden...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Geen leads gevonden</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={selectedLeads.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded border-muted-foreground"
                    />
                  </TableHead>
                  <TableHead className="w-[30px]"></TableHead>
                  <TableHead>Organisatie</TableHead>
                  <TableHead>Contactpersoon</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Sales Executive</TableHead>
                  <TableHead>Activiteiten</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Toegewezen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(lead => {
                  const isExpanded = expandedLeads.has(lead.id);
                  const count = activityCounts[lead.id] || 0;
                  return (
                    <>
                      <TableRow key={lead.id} className={`${selectedLeads.has(lead.id) ? 'bg-accent/50' : ''} ${count > 0 ? 'cursor-pointer' : ''}`}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedLeads.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="rounded border-muted-foreground"
                          />
                        </TableCell>
                        <TableCell className="px-1">
                          {count > 0 && (
                            <button onClick={() => toggleExpand(lead.id)} className="p-1 rounded hover:bg-accent">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{lead.org_name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{lead.person_name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            {lead.person_email && (
                              <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.person_email}</div>
                            )}
                            {lead.person_phone && (
                              <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.person_phone}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{seMap[lead.sales_executive_id]?.full_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusColors[lead.status] || ''}>
                            {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lead.assigned_at ? new Date(lead.assigned_at).toLocaleDateString('nl-NL') : '—'}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${lead.id}-activities`}>
                          <TableCell colSpan={9} className="p-0 bg-muted/30">
                            <LeadActivityHistory leadAssignmentId={lead.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reassign dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leads herverdelen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedLeads.size} lead(s) geselecteerd. Kies de nieuwe sales executive:
          </p>
          <Select value={targetSeId} onValueChange={setTargetSeId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecteer sales executive..." />
            </SelectTrigger>
            <SelectContent>
              {ses.map(se => (
                <SelectItem key={se.id} value={se.id}>{se.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleReassign} disabled={!targetSeId || reassigning}>
              {reassigning ? 'Bezig...' : 'Herverdelen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
