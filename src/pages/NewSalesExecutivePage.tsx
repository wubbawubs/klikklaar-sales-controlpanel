import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

const steps = [
  { id: 'personal', title: 'SE Gegevens', description: 'Persoonlijke informatie' },
  { id: 'workspace', title: 'Workspace', description: 'Workspace-instellingen' },
  { id: 'sales', title: 'Lead & Sales', description: 'Lead- en sales-instellingen' },
  { id: 'integrations', title: 'Integraties', description: 'Integratie-instellingen' },
  { id: 'admin', title: 'Beheer', description: 'Beheergegevens' },
];

export default function NewSalesExecutivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    start_date: '',
    external_guest_email: '',
    external_access_required: false,
    status: 'active' as const,

    workspace_name: '',
    sharepoint_site_name: '',
    workspace_slug: '',
    provisioning_mode: 'design_only' as const,
    include_training_library: true,
    include_lead_list: true,
    include_excel_import: false,
    eod_typeform_url: '',
    eod_display_mode: 'embedded' as const,

    product_lines: ['KlikklaarSEO'] as string[],
    deal_registration_enabled: true,
    appointment_scheduling_enabled: true,
    account_management_enabled: true,

    pipedrive_enabled: false,
    exact_enabled: false,
    qapitaal_enabled: false,
    eod_embedded: true,
    eod_external_link: false,

    notes: '',
  });

  const update = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const defaultWsName = fullName ? `Klikklaar SEO – SE – ${fullName}` : '';

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      toast.error('Voornaam, achternaam en e-mail zijn verplicht');
      return;
    }
    setSaving(true);
    try {
      const { data: se, error: seError } = await supabase
        .from('sales_executives')
        .insert({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone || null,
          start_date: form.start_date || null,
          external_guest_email: form.external_guest_email || null,
          external_access_required: form.external_access_required,
          status: form.status,
          created_by: user?.id,
        })
        .select()
        .single();

      if (seError) throw seError;

      const { error: wsError } = await supabase.from('workspaces').insert({
        sales_executive_id: se.id,
        workspace_name: form.workspace_name || defaultWsName,
        workspace_slug: form.workspace_slug || fullName.toLowerCase().replace(/\s+/g, '-'),
        sharepoint_site_name: form.sharepoint_site_name || defaultWsName,
        provisioning_mode: form.provisioning_mode,
        include_training_library: form.include_training_library,
        include_lead_list: form.include_lead_list,
        include_excel_import: form.include_excel_import,
        eod_typeform_url: form.eod_typeform_url || null,
        eod_display_mode: form.eod_display_mode,
        product_lines: form.product_lines,
        deal_registration_enabled: form.deal_registration_enabled,
        appointment_scheduling_enabled: form.appointment_scheduling_enabled,
        account_management_enabled: form.account_management_enabled,
      });

      if (wsError) throw wsError;

      // Audit log
      await supabase.from('audit_logs').insert({
        actor_user_id: user?.id,
        action_type: 'create',
        entity_type: 'sales_executive',
        entity_id: se.id,
        after_json: se,
      });

      toast.success('Sales Executive succesvol aangemaakt');
      navigate(`/sales-executives/${se.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nieuwe Sales Executive</h1>
        <p className="text-muted-foreground text-sm mt-1">Vul alle gegevens in om een nieuwe SE aan te maken</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(i)}
            className={`flex-1 p-3 rounded-lg border text-left transition-colors ${
              i === step ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <p className="text-xs font-medium">Stap {i + 1}</p>
            <p className="text-sm font-semibold">{s.title}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{steps[step].title}</CardTitle>
          <CardDescription>{steps[step].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Voornaam *</Label>
                  <Input value={form.first_name} onChange={e => update('first_name', e.target.value)} placeholder="Jan" />
                </div>
                <div className="space-y-2">
                  <Label>Achternaam *</Label>
                  <Input value={form.last_name} onChange={e => update('last_name', e.target.value)} placeholder="Jansen" />
                </div>
              </div>
              {fullName && (
                <div className="space-y-2">
                  <Label>Volledige naam</Label>
                  <Input value={fullName} disabled className="bg-muted" />
                </div>
              )}
              <div className="space-y-2">
                <Label>E-mailadres *</Label>
                <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="jan@klikklaar.nl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefoonnummer</Label>
                  <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+31 6 12345678" />
                </div>
                <div className="space-y-2">
                  <Label>Startdatum</Label>
                  <Input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Externe gast-e-mail</Label>
                <Input value={form.external_guest_email} onChange={e => update('external_guest_email', e.target.value)} placeholder="optioneel" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.external_access_required} onCheckedChange={v => update('external_access_required', v)} />
                <Label>Externe toegang vereist</Label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Workspace naam</Label>
                <Input value={form.workspace_name} onChange={e => update('workspace_name', e.target.value)} placeholder={defaultWsName || 'Klikklaar SEO – SE – [Naam]'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SharePoint site naam</Label>
                  <Input value={form.sharepoint_site_name} onChange={e => update('sharepoint_site_name', e.target.value)} placeholder={defaultWsName} />
                </div>
                <div className="space-y-2">
                  <Label>URL slug</Label>
                  <Input value={form.workspace_slug} onChange={e => update('workspace_slug', e.target.value)} placeholder="jan-jansen" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Provisioning mode</Label>
                <Select value={form.provisioning_mode} onValueChange={v => update('provisioning_mode', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="design_only">Alleen ontwerp</SelectItem>
                    <SelectItem value="export_package">Export pakket</SelectItem>
                    <SelectItem value="controlled_execution">Gecontroleerde uitvoering</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.include_training_library} onCheckedChange={v => update('include_training_library', v)} />
                  <Label>Trainingsbibliotheek toevoegen</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.include_lead_list} onCheckedChange={v => update('include_lead_list', v)} />
                  <Label>Leadlijst aanmaken</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.include_excel_import} onCheckedChange={v => update('include_excel_import', v)} />
                  <Label>Excel-importtemplate klaarzetten</Label>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Productlijnen actief</Label>
                <div className="flex gap-4">
                  {['KlikklaarSEO', 'KlikklaarWEB'].map(pl => (
                    <label key={pl} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.product_lines.includes(pl)}
                        onChange={e => {
                          if (e.target.checked) {
                            update('product_lines', [...form.product_lines, pl]);
                          } else {
                            update('product_lines', form.product_lines.filter(p => p !== pl));
                          }
                        }}
                        className="rounded border-input"
                      />
                      {pl}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.deal_registration_enabled} onCheckedChange={v => update('deal_registration_enabled', v)} />
                  <Label>Dealregistratie activeren</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.appointment_scheduling_enabled} onCheckedChange={v => update('appointment_scheduling_enabled', v)} />
                  <Label>Afspraakplanning activeren</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.account_management_enabled} onCheckedChange={v => update('account_management_enabled', v)} />
                  <Label>Accountmanagement activeren</Label>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={form.pipedrive_enabled} onCheckedChange={v => update('pipedrive_enabled', v)} />
                  <Label>Pipedrive koppeling</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.exact_enabled} onCheckedChange={v => update('exact_enabled', v)} />
                  <Label>Exact koppeling</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.qapitaal_enabled} onCheckedChange={v => update('qapitaal_enabled', v)} />
                  <Label>Qapitaal koppeling</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Typeform EOD URL</Label>
                <Input value={form.eod_typeform_url} onChange={e => update('eod_typeform_url', e.target.value)} placeholder="https://form.typeform.com/to/..." />
              </div>
              <div className="space-y-2">
                <Label>EOD weergave</Label>
                <Select value={form.eod_display_mode} onValueChange={v => update('eod_display_mode', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="embedded">Embedded weergave</SelectItem>
                    <SelectItem value="external_link">Alleen externe link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="space-y-2">
                <Label>Beheerder</Label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Aanvraagdatum</Label>
                <Input value={new Date().toLocaleDateString('nl-NL')} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Interne opmerking</Label>
                <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Optionele opmerking..." rows={3} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Vorige
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)}>
            Volgende <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Opslaan...' : 'Sales Executive aanmaken'}
          </Button>
        )}
      </div>
    </div>
  );
}
