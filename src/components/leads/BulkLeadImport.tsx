import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SalesExecutive } from '@/types/database';

interface ParsedLead {
  org_name: string;
  person_name: string;
  person_email: string;
  person_phone: string;
  website: string;
  branche: string;
  notes: string;
}

const EXPECTED_HEADERS = ['org_name', 'person_name', 'person_email', 'person_phone', 'website', 'branche', 'notes'];
const HEADER_ALIASES: Record<string, string> = {
  organisatie: 'org_name', bedrijf: 'org_name', company: 'org_name', bedrijfsnaam: 'org_name',
  naam: 'person_name', contact: 'person_name', name: 'person_name', contactpersoon: 'person_name',
  email: 'person_email', 'e-mail': 'person_email', mail: 'person_email',
  telefoon: 'person_phone', phone: 'person_phone', tel: 'person_phone', telefoonnummer: 'person_phone',
  website: 'website', url: 'website', site: 'website',
  branche: 'branche', sector: 'branche', industry: 'branche',
  notities: 'notes', opmerkingen: 'notes', notes: 'notes',
};

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',' || ch === ';' || ch === '\t') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(current.trim()); current = '';
        if (row.some(c => c)) lines.push(row);
        row = [];
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(c => c)) lines.push(row);
  return lines;
}

function mapHeaders(headers: string[]): (string | null)[] {
  return headers.map(h => {
    const normalized = h.toLowerCase().trim().replace(/[^a-z_]/g, '');
    if (EXPECTED_HEADERS.includes(normalized)) return normalized;
    return HEADER_ALIASES[normalized] || null;
  });
}

interface BulkLeadImportProps {
  ses: SalesExecutive[];
  onImported: () => void;
}

export default function BulkLeadImport({ ses, onImported }: BulkLeadImportProps) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [fileName, setFileName] = useState('');
  const [targetSeId, setTargetSeId] = useState('');
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError('');

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) { setParseError('Bestand bevat geen data-rijen.'); return; }

      const headerMap = mapHeaders(rows[0]);
      const orgIdx = headerMap.indexOf('org_name');
      if (orgIdx === -1) {
        setParseError('Kolom "organisatie" / "org_name" / "bedrijf" niet gevonden. Controleer je kolomkoppen.');
        return;
      }

      const leads: ParsedLead[] = rows.slice(1).map(row => ({
        org_name: row[headerMap.indexOf('org_name')] || '',
        person_name: headerMap.indexOf('person_name') >= 0 ? row[headerMap.indexOf('person_name')] || '' : '',
        person_email: headerMap.indexOf('person_email') >= 0 ? row[headerMap.indexOf('person_email')] || '' : '',
        person_phone: headerMap.indexOf('person_phone') >= 0 ? row[headerMap.indexOf('person_phone')] || '' : '',
        website: headerMap.indexOf('website') >= 0 ? row[headerMap.indexOf('website')] || '' : '',
        branche: headerMap.indexOf('branche') >= 0 ? row[headerMap.indexOf('branche')] || '' : '',
        notes: headerMap.indexOf('notes') >= 0 ? row[headerMap.indexOf('notes')] || '' : '',
      })).filter(l => l.org_name);

      if (leads.length === 0) { setParseError('Geen geldige rijen gevonden (org_name is leeg).'); return; }
      setParsed(leads);
    } catch {
      setParseError('Bestand kon niet worden gelezen.');
    }
  };

  const handleImport = async () => {
    if (!targetSeId || parsed.length === 0) return;
    setImporting(true);

    const rows = parsed.map(l => ({
      sales_executive_id: targetSeId,
      org_name: l.org_name || null,
      person_name: l.person_name || null,
      person_email: l.person_email || null,
      person_phone: l.person_phone || null,
      website: l.website || null,
      branche: l.branche || null,
      notes: l.notes || null,
      status: 'assigned',
    }));

    // Insert in batches of 100
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from('pipedrive_lead_assignments').insert(batch);
      if (error) {
        toast.error(`Import fout bij rij ${i + 1}: ${error.message}`);
        setImporting(false);
        return;
      }
      inserted += batch.length;
    }

    toast.success(`${inserted} leads geïmporteerd en toegewezen!`);
    setParsed([]);
    setFileName('');
    setTargetSeId('');
    setOpen(false);
    onImported();
    setImporting(false);
  };

  const reset = () => {
    setParsed([]);
    setFileName('');
    setParseError('');
    setTargetSeId('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <Button variant="outline" onClick={() => { reset(); setOpen(true); }}>
        <Upload className="h-4 w-4 mr-2" />
        Bellijst importeren
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bellijst importeren (CSV)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* File upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">CSV-bestand selecteren</label>
              <p className="text-xs text-muted-foreground">
                Verwachte kolommen: organisatie, contactpersoon, email, telefoon, website, branche, notities
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFile}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
              {fileName && <p className="text-sm text-muted-foreground">📄 {fileName}</p>}
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {parseError}
              </div>
            )}

            {parsed.length > 0 && (
              <>
                <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {parsed.length} leads herkend
                </div>

                {/* SE selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Toewijzen aan Sales Executive</label>
                  <Select value={targetSeId} onValueChange={setTargetSeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kies een sales executive..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ses.filter(se => se.status === 'active').map(se => (
                        <SelectItem key={se.id} value={se.id}>{se.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview table */}
                <div className="border rounded-md overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Organisatie</TableHead>
                        <TableHead className="text-xs">Contact</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Telefoon</TableHead>
                        <TableHead className="text-xs">Website</TableHead>
                        <TableHead className="text-xs">Branche</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.slice(0, 20).map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-1">{l.org_name}</TableCell>
                          <TableCell className="text-xs py-1">{l.person_name}</TableCell>
                          <TableCell className="text-xs py-1">{l.person_email}</TableCell>
                          <TableCell className="text-xs py-1">{l.person_phone}</TableCell>
                          <TableCell className="text-xs py-1">{l.website}</TableCell>
                          <TableCell className="text-xs py-1">{l.branche}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {parsed.length > 20 && (
                    <p className="text-xs text-muted-foreground p-2 text-center">
                      ...en {parsed.length - 20} meer rijen
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={handleImport} disabled={!targetSeId || parsed.length === 0 || importing}>
              {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importeren...</> : `${parsed.length} leads importeren`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
