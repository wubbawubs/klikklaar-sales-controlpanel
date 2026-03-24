import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Play, Download, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { buildArtifactInserts, getNextVersion } from '@/lib/artifact-generator';
import type { SalesExecutive, Workspace, IntegrationConfig, EodSubmission, GeneratedArtifact, AuditLog } from '@/types/database';

export default function SalesExecutiveDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const [se, setSe] = useState<SalesExecutive | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [eods, setEods] = useState<EodSubmission[]>([]);
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const { data: seData } = await supabase.from('sales_executives').select('*').eq('id', id).single();
      setSe(seData);
      if (seData) {
        const { data: wsData } = await supabase.from('workspaces').select('*').eq('sales_executive_id', id).maybeSingle();
        setWorkspace(wsData);
        if (wsData) {
          const [icRes, eodRes, artRes] = await Promise.all([
            supabase.from('integration_configs').select('*').eq('workspace_id', wsData.id),
            supabase.from('eod_submissions').select('*').eq('sales_executive_id', id).order('session_date', { ascending: false }),
            supabase.from('generated_artifacts').select('*').eq('workspace_id', wsData.id).order('created_at', { ascending: false }),
          ]);
          setIntegrations(icRes.data || []);
          setEods(eodRes.data || []);
          setArtifacts(artRes.data || []);
        }
        const { data: logData } = await supabase.from('audit_logs').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(50);
        setLogs(logData || []);
      }
      setLoading(false);
    };
    fetch();
  }, [id]);

  const handleProvision = async () => {
    if (!workspace || !se) {
      toast({ title: 'Geen workspace', description: 'Er is geen workspace geconfigureerd voor deze Sales Executive.', variant: 'destructive' });
      return;
    }
    setProvisioning(true);
    try {
      // Create provisioning job
      const { data: job, error: jobError } = await supabase.from('provisioning_jobs').insert({
        workspace_id: workspace.id,
        job_type: workspace.provisioning_mode || 'design_only',
        status: 'pending',
      }).select().single();

      if (jobError) throw jobError;

      // Auto-generate artifacts
      const artifactRows = buildArtifactInserts(se, workspace);
      await supabase.from('generated_artifacts').insert(artifactRows);

      // Update workspace status
      await supabase.from('workspaces').update({ sharepoint_status: 'artifacts_generated' }).eq('id', workspace.id);

      // Audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'provisioning_job',
        entity_id: job.id,
        action_type: 'create',
        actor_user_id: user?.id,
        after_json: { job_type: job.job_type, workspace_id: workspace.id, se_name: se.full_name },
      });

      // Update local state
      setWorkspace({ ...workspace, sharepoint_status: 'artifacts_generated' });

      // Refresh artifacts list
      const { data: newArtifacts } = await supabase.from('generated_artifacts').select('*').eq('workspace_id', workspace.id).order('created_at', { ascending: false });
      setArtifacts(newArtifacts || []);

      toast({ title: 'Provisioning gestart', description: `Job aangemaakt (${job.job_type}). Artifacts automatisch gegenereerd.` });
    } catch (err: any) {
      toast({ title: 'Fout bij provisioning', description: err.message, variant: 'destructive' });
    } finally {
      setProvisioning(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  if (!se) return <div className="text-center text-destructive p-8">Sales Executive niet gevonden</div>;

  return (
    <div className="space-y-6">
      <Link to="/sales-executives" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Terug naar overzicht
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{se.full_name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={se.status} />
            {workspace && <StatusBadge status={workspace.sharepoint_status} />}
            <span className="text-sm text-muted-foreground">{se.email}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/sales-executives/${id}/edit`}>
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" />Bewerken</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleProvision} disabled={provisioning}>
            {provisioning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Provisioneren
          </Button>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Exporteren</Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overzicht</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="sharepoint">SharePoint</TabsTrigger>
          <TabsTrigger value="integrations">Integraties</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="eod">EOD</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Persoonlijke gegevens</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Naam</span><span>{se.full_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">E-mail</span><span>{se.email}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Telefoon</span><span>{se.phone || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Startdatum</span><span>{se.start_date ? new Date(se.start_date).toLocaleDateString('nl-NL') : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Externe toegang</span><span>{se.external_access_required ? 'Ja' : 'Nee'}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Workspace status</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {workspace ? (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Naam</span><span>{workspace.workspace_name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={workspace.sharepoint_status} /></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><StatusBadge status={workspace.provisioning_mode} /></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Productlijnen</span><span>{workspace.product_lines?.join(', ')}</span></div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Geen workspace geconfigureerd</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="workspace">
          <Card>
            <CardHeader><CardTitle className="text-base">Workspace configuratie</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {workspace ? (
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries({
                    'Workspace naam': workspace.workspace_name,
                    'URL slug': workspace.workspace_slug,
                    'SharePoint site': workspace.sharepoint_site_name,
                    'Provisioning mode': workspace.provisioning_mode,
                    'Trainingsbibliotheek': workspace.include_training_library ? 'Ja' : 'Nee',
                    'Leadlijst': workspace.include_lead_list ? 'Ja' : 'Nee',
                    'Excel import': workspace.include_excel_import ? 'Ja' : 'Nee',
                    'Dealregistratie': workspace.deal_registration_enabled ? 'Ja' : 'Nee',
                    'Afspraakplanning': workspace.appointment_scheduling_enabled ? 'Ja' : 'Nee',
                    'EOD URL': workspace.eod_typeform_url || '—',
                    'EOD weergave': workspace.eod_display_mode,
                  }).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-muted-foreground">{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Geen workspace</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sharepoint">
          <Card>
            <CardHeader><CardTitle className="text-base">SharePoint structuur definitie</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-4">
              <div>
                <h4 className="font-medium mb-2">Pagina's</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  {['Startpagina','Lead lijsten','Deals en abonnementen','Afspraken','Training en coaching','End of Day Typeform evaluatie'].map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Lijsten</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  {['Leads','Deals en abonnementen','Afspraken','Activiteiten','EOD Status'].map(l => <li key={l}>{l}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Bibliotheken</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>Training en coaching (Videos, Coaching-documenten, Belscripts, FAQ, Procesinstructies, Productinformatie, Offerteformats)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Navigatie</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  {['Start','Lead lijsten','Deals en abonnementen','Afspraken','Training en coaching','End of Day Typeform evaluatie'].map(n => <li key={n}>{n}</li>)}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid grid-cols-2 gap-4">
            {['pipedrive','exact','qapitaal','typeform'].map(provider => {
              const ic = integrations.find(i => i.provider === provider);
              return (
                <Card key={provider}>
                  <CardHeader><CardTitle className="text-base capitalize">{provider}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <StatusBadge status={ic?.status || 'not_configured'} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ingeschakeld</span>
                      <span>{ic?.enabled ? 'Ja' : 'Nee'}</span>
                    </div>
                    {ic?.last_tested_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Laatste test</span>
                        <span>{new Date(ic.last_tested_at).toLocaleString('nl-NL')}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="artifacts">
          {artifacts.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nog geen artifacts gegenereerd</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {artifacts.map(a => (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{a.artifact_name}</p>
                      <p className="text-sm text-muted-foreground">{a.artifact_type} • v{a.version} • {a.artifact_format}</p>
                    </div>
                    <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Download</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="eod">
          {eods.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Nog geen EOD-inzendingen</CardContent></Card>
          ) : (
            <div className="bg-card rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Opvolging</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Notities</th>
                </tr></thead>
                <tbody>
                  {eods.map(eod => (
                    <tr key={eod.id} className="border-b last:border-0">
                      <td className="p-3">{new Date(eod.session_date).toLocaleDateString('nl-NL')}</td>
                      <td className="p-3"><StatusBadge status={eod.status} /></td>
                      <td className="p-3"><StatusBadge status={eod.follow_up_status} /></td>
                      <td className="p-3 text-muted-foreground">{eod.coach_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          {logs.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Geen logs beschikbaar</CardContent></Card>
          ) : (
            <div className="bg-card rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Actie</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                </tr></thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="p-3 text-muted-foreground">{new Date(log.created_at).toLocaleString('nl-NL')}</td>
                      <td className="p-3">{log.action_type}</td>
                      <td className="p-3 text-muted-foreground">{log.entity_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
