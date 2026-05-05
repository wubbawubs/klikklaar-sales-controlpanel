import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Download, Phone, Mail, Globe, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ScrapedLead {
  org_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
}

interface SELeadScraperProps {
  onImported?: () => void;
}

export default function SELeadScraper({ onImported }: SELeadScraperProps) {
  const { user } = useAuth();
  const [seId, setSeId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState('20');
  const [results, setResults] = useState<ScrapedLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [branche, setBranche] = useState('');
  const [importing, setImporting] = useState(false);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());

  // Resolve current SE id
  useEffect(() => {
    if (!user) return;
    supabase
      .from('sales_executives')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setSeId(data?.id ?? null));
  }, [user]);

  const handleSearch = async () => {
    if (!query.trim() || query.trim().length < 3) {
      toast.error('Voer minimaal 3 tekens in');
      return;
    }
    setSearching(true);
    setResults([]);
    setSelected(new Set());
    setDuplicates(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('lead-scraper', {
        body: { query: query.trim(), max_results: parseInt(maxResults, 10) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const leads: ScrapedLead[] = data?.leads || [];
      setResults(leads);
      // Pre-fill branche with the search query so leads are filterable per scrape
      if (!branche.trim()) setBranche(query.trim());
      if (leads.length === 0) {
        toast.info('Geen resultaten gevonden');
        return;
      }

      // Dedup against this SE's own existing leads
      if (seId) {
        const orgNames = leads.map(l => l.org_name).filter(Boolean);
        if (orgNames.length > 0) {
          const { data: existing } = await supabase
            .from('lead_assignments')
            .select('org_name')
            .eq('sales_executive_id', seId)
            .in('org_name', orgNames);
          if (existing) {
            setDuplicates(new Set(existing.map(e => e.org_name?.toLowerCase() || '')));
          }
        }
      }

      toast.success(`${leads.length} leads gevonden`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Zoeken mislukt';
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === results.length) setSelected(new Set());
    else setSelected(new Set(results.map((_, i) => i)));
  };

  const handleImport = async () => {
    if (!seId) {
      toast.error('Geen SE-profiel gevonden voor jouw account');
      return;
    }
    if (selected.size === 0) {
      toast.error('Selecteer minimaal één lead');
      return;
    }

    setImporting(true);
    const leadsToImport = Array.from(selected).map(i => results[i]);
    const rows = leadsToImport.map(l => ({
      sales_executive_id: seId,
      org_name: l.org_name,
      person_phone: l.phone,
      person_email: l.email,
      website: l.website,
      branche: branche || null,
      status: 'assigned',
      assigned_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('lead_assignments').insert(rows);

    if (error) {
      toast.error('Import mislukt: ' + error.message);
    } else {
      toast.success(`${leadsToImport.length} lead(s) toegevoegd aan jouw lijst`);
      setResults([]);
      setSelected(new Set());
      onImported?.();
    }
    setImporting(false);
  };

  const isDuplicate = (name: string) => duplicates.has(name?.toLowerCase());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Eigen leads scrapen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Zoek bedrijven op branche en regio en voeg ze direct toe aan jouw eigen leadlijst.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="bijv. interieur designer Enkhuizen"
                className="pl-9"
              />
            </div>
            <Select value={maxResults} onValueChange={setMaxResults}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 leads</SelectItem>
                <SelectItem value="20">20 leads</SelectItem>
                <SelectItem value="30">30 leads</SelectItem>
                <SelectItem value="50">50 leads</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} disabled={searching} className="min-w-[120px]">
              {searching ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Zoeken,</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Zoeken</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg">Resultaten ({results.length})</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={branche}
                  onChange={e => setBranche(e.target.value)}
                  placeholder="Branche tag (filter),"
                  className="w-[200px]"
                  title="Deze tag wordt opgeslagen als 'branche' zodat je later kunt filteren op deze scrape."
                />
                <Button
                  onClick={handleImport}
                  disabled={importing || selected.size === 0 || !seId}
                  size="sm"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Toevoegen ({selected.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === results.length}
                        onChange={toggleAll}
                        className="rounded border-muted-foreground"
                      />
                    </TableHead>
                    <TableHead>Bedrijf</TableHead>
                    <TableHead>Telefoon</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((lead, idx) => {
                    const dup = isDuplicate(lead.org_name);
                    return (
                      <TableRow
                        key={idx}
                        className={`cursor-pointer ${selected.has(idx) ? 'bg-accent/50' : ''} ${dup ? 'opacity-60' : ''}`}
                        onClick={() => toggleSelect(idx)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(idx)}
                            onChange={() => toggleSelect(idx)}
                            className="rounded border-muted-foreground"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{lead.org_name}</span>
                            {dup && <Badge variant="outline" className="text-xs ml-1">Bestaat al</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {lead.phone ? (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{lead.phone}</span>
                            </div>
                          ) : <span className="text-muted-foreground text-sm">,</span>}
                        </TableCell>
                        <TableCell>
                          {lead.email ? (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{lead.email}</span>
                            </div>
                          ) : <span className="text-muted-foreground text-sm">,</span>}
                        </TableCell>
                        <TableCell>
                          {lead.website ? (
                            <a
                              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-primary hover:underline text-sm"
                            >
                              <Globe className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate max-w-[180px]">
                                {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                              </span>
                            </a>
                          ) : <span className="text-muted-foreground text-sm">,</span>}
                        </TableCell>
                        <TableCell>
                          {dup ? (
                            <Badge variant="secondary" className="text-xs">Duplicaat</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Nieuw</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
