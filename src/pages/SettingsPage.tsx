import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import type { Setting } from '@/types/database';
import AuditLogsPage from '@/pages/AuditLogsPage';
import EmailMonitoringPage from '@/pages/EmailMonitoringPage';
import FunnelTargetsTab from '@/components/settings/FunnelTargetsTab';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'settings';
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('settings').select('*').order('key')
      .then(({ data }) => { setSettings(data || []); setLoading(false); });
  }, []);

  const getValue = (key: string) => {
    const s = settings.find(s => s.key === key);
    return s ? (typeof s.value_json === 'string' ? s.value_json : JSON.stringify(s.value_json)) : '';
  };

  const updateValue = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value_json: value } : s));
  };

  const handleSave = async () => {
    try {
      for (const s of settings) {
        let val = s.value_json;
        if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch { /* keep as string */ }
        }
        await supabase.from('settings').update({ value_json: val }).eq('id', s.id);
      }
      toast.success('Instellingen opgeslagen');
    } catch {
      toast.error('Opslaan mislukt');
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Instellingen</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="email">E-mail Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          {loading ? (
            <div className="text-center text-muted-foreground p-8">Laden...</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Beheerinstellingen</h2>
                  <p className="text-muted-foreground text-sm mt-1">Standaard configuratie en systeeminstellingen</p>
                </div>
                <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Opslaan</Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Standaard instellingen</CardTitle>
                  <CardDescription>Standaard waarden voor nieuwe workspaces en Sales Executives</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'default_workspace_name', label: 'Standaard workspace naam' },
                    { key: 'default_sharepoint_naming', label: 'Standaard SharePoint naamgeving' },
                    { key: 'default_lead_statuses', label: 'Standaard leadstatussen (JSON array)' },
                    { key: 'default_deal_statuses', label: 'Standaard dealstatussen (JSON array)' },
                    { key: 'default_navigation', label: 'Standaard navigatie (JSON array)' },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Input value={getValue(key)} onChange={e => updateValue(key, e.target.value)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">API & Integraties</CardTitle>
                  <CardDescription>Beveiligde configuratie voor externe diensten. Credentials worden server-side opgeslagen.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {['Pipedrive', 'Exact', 'Qapitaal', 'Typeform'].map(provider => (
                    <div key={provider} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{provider}</p>
                        <p className="text-xs text-muted-foreground">Configuratie via integratiecentrum</p>
                      </div>
                      <span className="text-xs text-muted-foreground">••••••••</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogsPage />
        </TabsContent>

        <TabsContent value="email">
          <EmailMonitoringPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
