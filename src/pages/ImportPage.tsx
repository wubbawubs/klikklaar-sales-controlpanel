import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, ArrowRight, Check } from 'lucide-react';
import { parseCsv, type ParsedCsv } from '@/lib/csv';
import { useImportRows, autoMap, IMPORT_FIELDS, type Mapping, type ImportResult } from '@/hooks/useImport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const NONE = '__none__';

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const importRows = useImportRows();
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Mapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsv(parsed);
    setFileName(file.name);
    setMapping(autoMap(parsed.headers));
    setResult(null);
  };

  const runImport = () => {
    if (!csv) return;
    importRows.mutate({ rows: csv.rows, mapping }, { onSuccess: (r) => setResult(r) });
  };

  const preview = csv?.rows.slice(0, 5) ?? [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importeren</h1>
        <p className="text-sm text-muted-foreground">Upload een Pipedrive-export (CSV) om bedrijven, contacten en deals te importeren in je huidige CRM.</p>
      </div>

      {/* 1. Upload */}
      <Card>
        <CardHeader><CardTitle className="text-sm">1. Bestand</CardTitle></CardHeader>
        <CardContent>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            <Upload className="h-6 w-6" />
            <span className="text-sm font-medium">{fileName || 'Klik om een CSV te kiezen'}</span>
            {csv && <span className="text-xs">{csv.rows.length} rijen · {csv.headers.length} kolommen</span>}
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
        </CardContent>
      </Card>

      {/* 2. Mapping */}
      {csv && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">2. Kolommen koppelen</CardTitle>
            <CardDescription className="text-xs">Automatisch geraden — pas aan waar nodig.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            {IMPORT_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <span className="text-xs w-28 shrink-0 text-muted-foreground">{f.label}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <Select
                  value={mapping[f.key] ?? NONE}
                  onValueChange={v => setMapping(m => ({ ...m, [f.key]: v === NONE ? undefined : v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {csv.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. Preview */}
      {csv && preview.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">3. Voorbeeld (eerste 5)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  {IMPORT_FIELDS.filter(f => mapping[f.key]).map(f => <th key={f.key} className="py-1.5 pr-3 font-medium">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {IMPORT_FIELDS.filter(f => mapping[f.key]).map(f => (
                      <td key={f.key} className="py-1.5 pr-3 truncate max-w-[160px]">{row[mapping[f.key]!]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 4. Import */}
      {csv && (
        <div className="flex items-center justify-between">
          {result ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200 gap-1">
              <Check className="h-3 w-3" /> {result.deals} deals · {result.companies} bedrijven · {result.contacts} contacten geïmporteerd
              {result.skipped > 0 && ` · ${result.skipped} overgeslagen`}
            </Badge>
          ) : <span className="text-xs text-muted-foreground">Klaar om {csv.rows.length} rijen te importeren in het huidige CRM.</span>}
          <Button onClick={runImport} disabled={importRows.isPending || !mapping.company && !mapping.title && !mapping.contact}>
            {importRows.isPending ? 'Importeren…' : `Importeer ${csv.rows.length} rijen`}
          </Button>
        </div>
      )}
    </div>
  );
}
