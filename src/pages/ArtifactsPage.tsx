import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Download, FileJson, RefreshCw } from 'lucide-react';
import type { SalesExecutive, Workspace, GeneratedArtifact } from '@/types/database';

const artifactTypes = [
  { type: 'sharepoint_manifest', name: 'SharePoint Provisioning Manifest', format: 'json' },
  { type: 'site_script', name: 'SharePoint Site Script', format: 'json' },
  { type: 'rights_plan', name: 'SharePoint Rights Plan', format: 'json' },
  { type: 'power_automate_manifest', name: 'Power Automate Flow Manifest', format: 'json' },
  { type: 'integration_config', name: 'Integratieconfiguratie', format: 'json' },
  { type: 'implementation_checklist', name: 'Implementatiechecklist', format: 'txt' },
  { type: 'deployment_summary', name: 'Deployment Samenvatting', format: 'txt' },
];

function generateArtifact(type: string, se: SalesExecutive, ws: Workspace) {
  const base = { generatedAt: new Date().toISOString(), salesExecutive: se.full_name, workspace: ws.workspace_name };

  switch (type) {
    case 'sharepoint_manifest':
      return JSON.stringify({
        ...base, siteDefinition: {
          title: ws.workspace_name, url: `/sites/${ws.workspace_slug}`,
          template: 'TeamSite',
          lists: ['Leads', 'Deals en abonnementen', 'Afspraken', 'Activiteiten', 'EOD Status'],
          libraries: ws.include_training_library ? ['Training en coaching'] : [],
          pages: ['Startpagina', 'Lead lijsten', 'Deals en abonnementen', 'Afspraken', 'Training en coaching', 'End of Day Typeform evaluatie'],
          navigation: ['Start', 'Lead lijsten', 'Deals en abonnementen', 'Afspraken', 'Training en coaching', 'End of Day Typeform evaluatie'],
        }
      }, null, 2);
    case 'site_script':
      return JSON.stringify({
        '$schema': 'https://developer.microsoft.com/json-schemas/sp/site-design-script-actions.schema.json',
        actions: [
          { verb: 'createSPList', listName: 'Leads', templateType: 100 },
          { verb: 'createSPList', listName: 'Deals', templateType: 100 },
          { verb: 'createSPList', listName: 'Afspraken', templateType: 100 },
          { verb: 'createSPList', listName: 'Activiteiten', templateType: 100 },
          { verb: 'createSPList', listName: 'EOD Status', templateType: 100 },
        ], ...base
      }, null, 2);
    case 'rights_plan':
      return JSON.stringify({
        ...base, permissions: {
          siteOwners: ['Klikklaar SEO Admins'],
          siteMembers: [se.full_name],
          siteVisitors: [],
          externalAccess: se.external_access_required,
          externalGuestEmail: se.external_guest_email,
        }
      }, null, 2);
    case 'power_automate_manifest':
      return JSON.stringify({
        ...base, flows: [
          { name: 'SE Registratie', trigger: 'Nieuwe SE aangemaakt', actions: ['Workspace aanmaken', 'Lijsten configureren', 'Rechten toewijzen'] },
          { name: 'Leadimport', trigger: 'Excel upload', actions: ['Data valideren', 'Leads importeren', 'Status bijwerken'] },
          { name: 'EOD Intake', trigger: 'Typeform webhook', actions: ['Response opslaan', 'Notificatie sturen', 'Status bijwerken'] },
          { name: 'Foutafhandeling', trigger: 'Fout gedetecteerd', actions: ['Log aanmaken', 'Retry plannen', 'Admin notificeren'] },
        ]
      }, null, 2);
    case 'integration_config':
      return JSON.stringify({
        ...base, integrations: {
          pipedrive: { enabled: false, status: 'not_configured' },
          exact: { enabled: false, status: 'not_configured' },
          qapitaal: { enabled: false, status: 'not_configured' },
          typeform: { enabled: !!ws.eod_typeform_url, url: ws.eod_typeform_url, displayMode: ws.eod_display_mode },
        }
      }, null, 2);
    case 'implementation_checklist':
      return [
        `# Implementatiechecklist - ${se.full_name}`,
        `Gegenereerd: ${new Date().toLocaleString('nl-NL')}`,
        '',
        '## SharePoint',
        `- [ ] Site "${ws.workspace_name}" aanmaken`,
        '- [ ] Lijsten configureren (Leads, Deals, Afspraken, Activiteiten, EOD)',
        ws.include_training_library ? '- [ ] Trainingsbibliotheek aanmaken' : '',
        `- [ ] Rechten toewijzen aan ${se.full_name}`,
        se.external_access_required ? `- [ ] Externe gasttoegang instellen voor ${se.external_guest_email}` : '',
        '- [ ] Navigatie configureren',
        '',
        '## Power Automate',
        '- [ ] SE Registratie flow activeren',
        '- [ ] Leadimport flow configureren',
        ws.eod_typeform_url ? '- [ ] EOD Typeform webhook instellen' : '',
        '',
        '## Integraties',
        '- [ ] Pipedrive configureren (indien van toepassing)',
        '- [ ] Exact configureren (indien van toepassing)',
        '- [ ] Qapitaal configureren (indien van toepassing)',
      ].filter(Boolean).join('\n');
    case 'deployment_summary':
      return [
        `# Deployment Samenvatting - ${se.full_name}`,
        `Datum: ${new Date().toLocaleString('nl-NL')}`,
        '',
        `Sales Executive: ${se.full_name}`,
        `E-mail: ${se.email}`,
        `Workspace: ${ws.workspace_name}`,
        `Provisioning mode: ${ws.provisioning_mode}`,
        `Status: ${ws.sharepoint_status}`,
        `Productlijnen: ${ws.product_lines?.join(', ')}`,
      ].join('\n');
    default:
      return '{}';
  }
}

export default function ArtifactsPage() {
  const [ses, setSes] = useState<SalesExecutive[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedSeId, setSelectedSeId] = useState<string>('');
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
      const newArtifacts = artifactTypes.map(at => ({
        workspace_id: selectedWs.id,
        artifact_type: at.type,
        artifact_name: at.name,
        artifact_format: at.format,
        artifact_content: at.format === 'json' ? JSON.parse(generateArtifact(at.type, selectedSe, selectedWs)) : null,
        artifact_text: at.format === 'txt' ? generateArtifact(at.type, selectedSe, selectedWs) : null,
        version: '1.0',
      }));

      const { error } = await supabase.from('generated_artifacts').insert(newArtifacts);
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
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileJson className="h-4 w-4 text-primary" />
                    {a.artifact_name}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => copyContent(a)} title="Kopiëren"><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => downloadArtifact(a)} title="Downloaden"><Download className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">v{a.version} • {a.artifact_format.toUpperCase()} • {new Date(a.created_at).toLocaleString('nl-NL')}</p>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto max-h-64 text-foreground">
                  {a.artifact_content ? JSON.stringify(a.artifact_content, null, 2) : a.artifact_text}
                </pre>
              </CardContent>
            </Card>
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
