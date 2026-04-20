import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Download, Undo2, Mail, Building2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LostLead {
  id: string;
  org_name: string | null;
  person_name: string | null;
  person_email: string | null;
  person_phone: string | null;
  branche: string | null;
  updated_at: string | null;
}

const REACTIVATE_AFTER_DAYS = 28; // 4 weken

export default function MailExportList() {
  const { user } = useAuth();
  const [seId, setSeId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LostLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const fetchLost = useCallback(async () => {
    if (!seId) return;
    setLoading(true);
    const all: LostLead[] = [];
    let from = 0;
    const ps = 1000;
    while (true) {
      const { data } = await supabase
        .from('pipedrive_lead_assignments')
        .select('id, org_name, person_name, person_email, person_phone, branche, updated_at')
        .eq('sales_executive_id', seId)
        .eq('status', 'lost')
        .order('updated_at', { ascending: false })
        .range(from, from + ps - 1);
      if (!data || data.length === 0) break;
      all.push(...(data as LostLead[]));
      if (data.length < ps) break;
      from += ps;
    }
    setLeads(all);
    setLoading(false);
  }, [seId]);

  useEffect(() => { if (seId) fetchLost(); }, [seId, fetchLost]);

  const filtered = useMemo(() => {
    if (!search) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      l.org_name?.toLowerCase().includes(q) ||
      l.person_name?.toLowerCase().includes(q) ||
      l.person_email?.toLowerCase().includes(q) ||
      l.branche?.toLowerCase().includes(q),
    );
  }, [leads, search]);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportCsv = (rows: LostLead[]) => {
    if (rows.length === 0) {
      toast.error('Geen leads geselecteerd');
      return;
    }
    const header = ['Bedrijf', 'Contact', 'Email', 'Telefoon', 'Branche', 'Geen interesse op'];
    const escape = (v: string | null) => {
      const s = (v ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [
      header.join(','),
      ...rows.map(l => [
        escape(l.org_name),
        escape(l.person_name),
        escape(l.person_email),
        escape(l.person_phone),
        escape(l.branche),
        escape(l.updated_at ? new Date(l.updated_at).toISOString().slice(0, 10) : ''),
      ].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geen-interesse-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} leads geëxporteerd`);
  };

  const reactivate = async (id: string) => {
    const { error } = await supabase
      .from('pipedrive_lead_assignments')
      .update({ status: 'assigned', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Terugzetten mislukt: ' + error.message);
    } else {
      toast.success('Lead terug in bel-lijst');
      fetchLost();
    }
  };

  const daysSince = (iso: string | null) => {
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  };

  if (!seId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Geen SE-profiel gevonden.</div>;
  }

  const selectedRows = filtered.filter(l => selected.has(l.id));

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail className="h-5 w-5" /> Mail export
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Leads met "Geen interesse" — klaar voor mail-campagne. Beschikbaar om opnieuw te bellen na 4 weken.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" /> Exporteer alles ({filtered.length})
            </Button>
            <Button
              size="sm"
              onClick={() => exportCsv(selectedRows)}
              disabled={selectedRows.length === 0}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" /> Exporteer selectie ({selectedRows.length})
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Zoek op bedrijf, contact, email..."
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Laden...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Geen leads in mail-export.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === filtered.length}
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }}
                        onChange={toggleAll}
                        className="rounded border-muted-foreground"
                      />
                    </TableHead>
                    <TableHead>Bedrijf</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefoon</TableHead>
                    <TableHead className="w-[140px]">Geen interesse op</TableHead>
                    <TableHead className="w-[160px]">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(lead => {
                    const days = daysSince(lead.updated_at);
                    const canReactivate = days >= REACTIVATE_AFTER_DAYS;
                    const remaining = Math.max(0, REACTIVATE_AFTER_DAYS - days);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleOne(lead.id)}
                            className="rounded border-muted-foreground"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm">{lead.org_name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{lead.person_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          {lead.person_email ? (
                            <a href={`mailto:${lead.person_email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0" />
                              {lead.person_email}
                            </a>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {lead.person_phone ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {lead.person_phone}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {canReactivate ? (
                            <Button size="sm" variant="outline" onClick={() => reactivate(lead.id)} className="gap-1.5 h-7 text-xs">
                              <Undo2 className="h-3 w-3" /> Terug naar bel-lijst
                            </Button>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button size="sm" variant="outline" disabled className="gap-1.5 h-7 text-xs">
                                    <Undo2 className="h-3 w-3" /> Over {remaining} {remaining === 1 ? 'dag' : 'dagen'}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Beschikbaar om opnieuw te bellen 4 weken na markering "Geen interesse"
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
