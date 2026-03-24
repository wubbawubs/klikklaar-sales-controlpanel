import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Download, FileJson, FileText, RefreshCw } from 'lucide-react';
import { buildArtifactInserts, getNextVersion } from '@/lib/artifact-generator';
import type { SalesExecutive, Workspace, GeneratedArtifact } from '@/types/database';

export default function ArtifactsPage() {
  const [ses, setSes] = useState<SalesExecutive[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedSeId, setSelectedSeId] = useState('');
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('sales_executives').select('*'),
      supabase.from('workspaces').select('*'),
    ]).then(([seRes, wsRes]) => {
      setSes(seRes.data || []);
      setWorkspaces(wsRes.data || []);
    });
  }, []);

  useEffect(() => {
    if (!selectedSeId) return;
    const ws = workspaces.find(w => w.sales_executive_id === selectedSeId);
    if (!ws) return;
    supabase.from('generated_artifacts').select('*').eq('workspace_id', ws.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setArtifacts(data || []));
  }, [selectedSeId, workspaces]);

  const selectedSe = ses.find(s => s.id === selectedSeId);
  const selectedWs = workspaces.find(w => w.sales_executive_id === selectedSeId);

  const handleGenerate = async () => {
    if (!selectedSe || !selectedWs) return;
    setGenerating(true);
    try {
      // Determine next version
      const { data: latestArtifact } = await supabase.from('generated_artifacts')
        .select('version').eq('workspace_id', selectedWs.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const nextVersion = getNextVersion(latestArtifact?.version ?? null);

      const rows = buildArtifactInserts(selectedSe, selectedWs, nextVersion);
      const { error } = await supabase.from('generated_artifacts').insert(rows);
      if (error) throw error;

      await supabase.from('workspaces').update({ sharepoint_status: 'artifacts_generated' }).eq('id', selectedWs.id);
      const { data } = await supabase.from('generated_artifacts').select('*').eq('workspace_id', selectedWs.id).order('created_at', { ascending: false });
      setArtifacts(data || []);
      toast.success('Alle artifacts succesvol gegenereerd');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Genereren mislukt');
    } finally {
      setGenerating(false);
    }
  };

  const copyContent = (artifact: GeneratedArtifact) => {
    const content = artifact.artifact_content ? JSON.stringify(artifact.artifact_content, null, 2) : artifact.artifact_text || '';
    navigator.clipboard.writeText(content);
    toast.success('Gekopieerd naar klembord');
  };

  const downloadArtifact = (artifact: GeneratedArtifact) => {
    const content = artifact.artifact_content ? JSON.stringify(artifact.artifact_content, null, 2) : artifact.artifact_text || '';
    const blob = new Blob([content], { type: artifact.artifact_format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.artifact_type}.${artifact.artifact_format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Artifacts & Exports</h1>
        <p className="text-muted-foreground text-sm mt-1">Genereer en beheer provisioning-artifacts per Sales Executive</p>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-sm space-y-2">
          <label className="text-sm font-medium text-foreground">Sales Executive</label>
          <Select value={selectedSeId} onValueChange={setSelectedSeId}>
            <SelectTrigger><SelectValue placeholder="Selecteer een SE..." /></SelectTrigger>
            <SelectContent>
              {ses.map(se => <SelectItem key={se.id} value={se.id}>{se.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedSe && selectedWs && (
          <Button onClick={handleGenerate} disabled={generating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Genereren...' : 'Alle artifacts genereren'}
          </Button>
        )}
      </div>

      {selectedSeId && artifacts.length > 0 && (
        <div className="space-y-4">
          {artifacts.map(a => (
            <ArtifactCard key={a.id} artifact={a} onCopy={copyContent} onDownload={downloadArtifact} />
          ))}
        </div>
      )}

      {selectedSeId && artifacts.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Nog geen artifacts gegenereerd voor deze Sales Executive. Klik op "Alle artifacts genereren" om te starten.
        </CardContent></Card>
      )}
    </div>
  );
}

function ArtifactCard({ artifact: a, onCopy, onDownload }: {
  artifact: GeneratedArtifact;
  onCopy: (a: GeneratedArtifact) => void;
  onDownload: (a: GeneratedArtifact) => void;
}) {
  const Icon = a.artifact_format === 'json' ? FileJson : FileText;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {a.artifact_name}
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => onCopy(a)} title="Kopiëren"><Copy className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDownload(a)} title="Downloaden"><Download className="h-4 w-4" /></Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">v{a.version} • {a.artifact_format?.toUpperCase()} • {new Date(a.created_at!).toLocaleString('nl-NL')}</p>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto max-h-64 text-foreground">
          {a.artifact_content ? JSON.stringify(a.artifact_content, null, 2) : a.artifact_text}
        </pre>
      </CardContent>
    </Card>
  );
}
