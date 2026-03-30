import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, User, Phone, Mail, Plus, PhoneCall, CheckCircle2, Clock, Loader2, ExternalLink, Search, DollarSign, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { DealDetailSheet } from '@/components/pipedrive/DealDetailSheet';

interface LeadAssignment {
  id: string;
  pipedrive_org_id: number | null;
  pipedrive_person_id: number | null;
  org_name: string | null;
  person_name: string | null;
  person_email: string | null;
  person_phone: string | null;
  deal_title: string | null;
  status: string;
  notes: string | null;
}

interface Activity {
  id: string;
  activity_type: string;
  subject: string | null;
  note: string | null;
  outcome: string | null;
  done: boolean;
  due_date: string | null;
  duration_minutes: number | null;
  created_at: string;
  synced_to_pipedrive: boolean;
  lead_assignment_id: string | null;
}

interface PipedriveActivity {
  id: number;
  type: string;
  subject: string;
  note: string | null;
  done: boolean;
  due_date: string | null;
  person_name: string | null;
  org_name: string | null;
  add_time: string;
}

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  person_name: string | null;
  org_name: string | null;
  owner_name: string | null;
  expected_close_date: string | null;
  add_time: string;
  status: string;
  stage_id: number;
}

interface DealStage {
  id: number;
  name: string;
  order: number;
  deals_count: number;
  deals_value: number;
  deals: PipedriveDeal[];
}

interface Props {
  salesExecutiveId: string;
  salesExecutiveName: string;
}

export default function SalesExecutiveCRM({ salesExecutiveId, salesExecutiveName }: Props) {
  const [leads, setLeads] = useState<LeadAssignment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pipedriveActivities, setPipedriveActivities] = useState<PipedriveActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadAssignment | null>(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsTotalValue, setDealsTotalValue] = useState(0);
  const [detailOrgId, setDetailOrgId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // New activity form
  const [activityForm, setActivityForm] = useState({
    activity_type: 'call',
    subject: '',
    note: '',
    outcome: '',
    duration_minutes: 0,
  });

  useEffect(() => {
    loadData();
  }, [salesExecutiveId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsRes, activitiesRes] = await Promise.all([
        (supabase as any).from('pipedrive_lead_assignments').select('*').eq('sales_executive_id', salesExecutiveId).order('created_at', { ascending: false }),
        (supabase as any).from('pipedrive_activities').select('*').eq('sales_executive_id', salesExecutiveId).order('created_at', { ascending: false }).limit(100),
      ]);
      setLeads(leadsRes.data || []);
      setActivities(activitiesRes.data || []);
    } catch (err) {
      console.error('Failed to load CRM data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipedriveActivities = async (orgId: number) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-activities?org_id=${orgId}`,
        { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const result = await res.json();
      setPipedriveActivities(result.activities || []);
    } catch (err) {
      console.error('Failed to fetch Pipedrive activities:', err);
    }
  };

  const fetchDeals = async () => {
    setDealsLoading(true);
    try {
      // First check if this SE is an employee with a Pipedrive user
      const { data: se } = await supabase
        .from('sales_executives')
        .select('email, employment_type')
        .eq('id', salesExecutiveId)
        .single();

      let queryParam = '';
      if (se?.employment_type === 'employee') {
        // Resolve Pipedrive user_id for employees
        const userRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-users?email=${encodeURIComponent(se.email)}`,
          { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const userData = await userRes.json();
        if (userData.found && userData.user?.id) {
          queryParam = `user_id=${userData.user.id}`;
        }
      }
      
      if (!queryParam) {
        // Fallback to org_ids from lead assignments
        const orgIds = [...new Set(leads.map(l => l.pipedrive_org_id).filter(Boolean))];
        if (orgIds.length === 0) { setDealsLoading(false); return; }
        queryParam = `org_ids=${orgIds.join(',')}`;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-deals?${queryParam}`,
        { headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const result = await res.json();
      setDealStages((result.stages || []).filter((s: DealStage) => s.deals_count > 0));
      setDealsTotalValue(result.total_value || 0);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    } finally {
      setDealsLoading(false);
    }
  };

  const logActivity = async () => {
    if (!selectedLead) return;
    setSyncing(true);
    try {
      // 1. Create activity in our database
      const { data: localActivity, error: localErr } = await (supabase as any).from('pipedrive_activities').insert({
        sales_executive_id: salesExecutiveId,
        lead_assignment_id: selectedLead.id,
        pipedrive_org_id: selectedLead.pipedrive_org_id,
        pipedrive_person_id: selectedLead.pipedrive_person_id,
        activity_type: activityForm.activity_type,
        subject: activityForm.subject || `${activityForm.activity_type === 'call' ? 'Belpoging' : 'Activiteit'} - ${selectedLead.org_name}`,
        note: activityForm.note || null,
        outcome: activityForm.outcome || null,
        done: true,
        duration_minutes: activityForm.duration_minutes || null,
      }).select().single();

      if (localErr) throw localErr;

      // 2. Sync to Pipedrive
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipedrive-activities`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subject: activityForm.subject || `Belpoging - ${selectedLead.org_name}`,
              type: activityForm.activity_type,
              org_id: selectedLead.pipedrive_org_id,
              person_id: selectedLead.pipedrive_person_id,
              note: activityForm.note ? `[${salesExecutiveName}] ${activityForm.note}` : `[${salesExecutiveName}] Activiteit gelogd via Klikklaar`,
              done: true,
              duration: activityForm.duration_minutes ? `${Math.floor(activityForm.duration_minutes / 60)}:${String(activityForm.duration_minutes % 60).padStart(2, '0')}` : undefined,
            }),
          }
        );
        const result = await res.json();
        if (result.success && result.activity) {
          // Update local record with Pipedrive ID
          await (supabase as any).from('pipedrive_activities')
            .update({ pipedrive_activity_id: result.activity.id, synced_to_pipedrive: true })
            .eq('id', localActivity.id);
        }
      } catch (syncErr) {
        console.error('Failed to sync to Pipedrive:', syncErr);
        await (supabase as any).from('pipedrive_activities')
          .update({ pipedrive_sync_error: String(syncErr) })
          .eq('id', localActivity.id);
      }

      toast.success('Activiteit gelogd en gesynchroniseerd met Pipedrive');
      setShowActivityDialog(false);
      setActivityForm({ activity_type: 'call', subject: '', note: '', outcome: '', duration_minutes: 0 });
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Fout bij het loggen van activiteit');
    } finally {
      setSyncing(false);
    }
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    await (supabase as any).from('pipedrive_lead_assignments').update({ status }).eq('id', leadId);
    loadData();
    toast.success('Lead status bijgewerkt');
  };

  const filteredLeads = leads.filter(l =>
    !searchTerm ||
    l.org_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.person_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const statusCounts = {
    assigned: leads.filter(l => l.status === 'assigned').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
    converted: leads.filter(l => l.status === 'converted').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Toegewezen', count: statusCounts.assigned, color: 'bg-blue-500' },
          { label: 'Gecontacteerd', count: statusCounts.contacted, color: 'bg-amber-500' },
          { label: 'Gekwalificeerd', count: statusCounts.qualified, color: 'bg-green-500' },
          { label: 'Geconverteerd', count: statusCounts.converted, color: 'bg-primary' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${s.color} flex items-center justify-center text-white font-bold`}>
                {s.count}
              </div>
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">leads</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
          <TabsTrigger value="deals" onClick={() => { if (dealStages.length === 0 && !dealsLoading) fetchDeals(); }}>Deals</TabsTrigger>
          <TabsTrigger value="activities">Activiteiten ({activities.length})</TabsTrigger>
          <TabsTrigger value="pipedrive">Pipedrive Live</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Zoek leads..."
              className="pl-10"
            />
          </div>

          {filteredLeads.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Geen leads toegewezen. Wijs leads toe via het bewerken scherm.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredLeads.map(lead => (
                <Card key={lead.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{lead.org_name}</p>
                          {lead.person_name && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                              <User className="h-3 w-3" />{lead.person_name}
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {lead.person_email && (
                              <a href={`mailto:${lead.person_email}`} className="text-xs text-primary flex items-center gap-1">
                                <Mail className="h-3 w-3" />{lead.person_email}
                              </a>
                            )}
                            {lead.person_phone && (
                              <a href={`tel:${lead.person_phone}`} className="text-xs text-primary flex items-center gap-1">
                                <Phone className="h-3 w-3" />{lead.person_phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={lead.status} onValueChange={v => updateLeadStatus(lead.id, v)}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="assigned">Toegewezen</SelectItem>
                            <SelectItem value="contacted">Gecontacteerd</SelectItem>
                            <SelectItem value="qualified">Gekwalificeerd</SelectItem>
                            <SelectItem value="converted">Geconverteerd</SelectItem>
                            <SelectItem value="lost">Verloren</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedLead(lead);
                            setShowActivityDialog(true);
                            if (lead.pipedrive_org_id) fetchPipedriveActivities(lead.pipedrive_org_id);
                          }}
                        >
                          <PhoneCall className="h-4 w-4 mr-1" />Log
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="space-y-4">
          {dealsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Deals ophalen uit Pipedrive...</span>
            </div>
          ) : dealStages.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>Geen deals gevonden voor de toegewezen leads.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchDeals}>
                  <TrendingUp className="h-4 w-4 mr-1" />Deals ophalen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {dealStages.reduce((sum, s) => sum + s.deals_count, 0)} deal(s) gevonden
                </p>
                <Badge variant="secondary" className="text-sm">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Totaal: €{dealsTotalValue.toLocaleString('nl-NL')}
                </Badge>
              </div>
              <div className="grid gap-4">
                {dealStages.map(stage => (
                  <Card key={stage.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">{stage.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{stage.deals_count} deal{stage.deals_count !== 1 ? 's' : ''}</Badge>
                          <Badge variant="secondary">€{stage.deals_value.toLocaleString('nl-NL')}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {stage.deals.map(deal => (
                        <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <TrendingUp className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{deal.title}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {deal.org_name && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{deal.org_name}</span>}
                                {deal.person_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{deal.person_name}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">€{deal.value.toLocaleString('nl-NL')}</p>
                            {deal.expected_close_date && (
                              <p className="text-xs text-muted-foreground">
                                Verwacht: {new Date(deal.expected_close_date).toLocaleDateString('nl-NL')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="activities" className="space-y-2">
          {activities.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Nog geen activiteiten gelogd
              </CardContent>
            </Card>
          ) : (
            activities.map(act => (
              <Card key={act.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${act.done ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                    {act.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{act.subject || act.activity_type}</p>
                    {act.note && <p className="text-xs text-muted-foreground truncate">{act.note}</p>}
                    {act.outcome && <Badge variant="outline" className="text-xs mt-1">{act.outcome}</Badge>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{new Date(act.created_at).toLocaleDateString('nl-NL')}</p>
                    {act.synced_to_pipedrive && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        <ExternalLink className="h-3 w-3 mr-1" />Synced
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="pipedrive" className="space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            Live activiteiten uit Pipedrive voor de geselecteerde leads van {salesExecutiveName}.
          </p>
          {leads.length > 0 && leads[0].pipedrive_org_id ? (
            <Button variant="outline" size="sm" onClick={() => {
              const orgIds = [...new Set(leads.map(l => l.pipedrive_org_id).filter(Boolean))];
              if (orgIds[0]) fetchPipedriveActivities(orgIds[0]);
            }}>
              <Loader2 className="h-4 w-4 mr-1" />Pipedrive activiteiten ophalen
            </Button>
          ) : null}
          {pipedriveActivities.map(act => (
            <Card key={act.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${act.done ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                  {act.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{act.subject}</p>
                  <p className="text-xs text-muted-foreground">{act.org_name} {act.person_name && `• ${act.person_name}`}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{act.due_date || new Date(act.add_time).toLocaleDateString('nl-NL')}</p>
                  <Badge variant="outline" className="text-xs">{act.type}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Log Activity Dialog */}
      <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Activiteit loggen</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-medium text-sm">{selectedLead.org_name}</p>
                {selectedLead.person_name && (
                  <p className="text-xs text-muted-foreground">{selectedLead.person_name}</p>
                )}
              </div>

              <div className="space-y-3">
                <Select value={activityForm.activity_type} onValueChange={v => setActivityForm(f => ({ ...f, activity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Belpoging</SelectItem>
                    <SelectItem value="meeting">Afspraak</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="task">Taak</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  value={activityForm.subject}
                  onChange={e => setActivityForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Onderwerp (optioneel)"
                />

                <Select value={activityForm.outcome} onValueChange={v => setActivityForm(f => ({ ...f, outcome: v }))}>
                  <SelectTrigger><SelectValue placeholder="Uitkomst..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bereikt">Bereikt</SelectItem>
                    <SelectItem value="niet_bereikt">Niet bereikt</SelectItem>
                    <SelectItem value="voicemail">Voicemail</SelectItem>
                    <SelectItem value="terugbellen">Terugbellen</SelectItem>
                    <SelectItem value="afspraak_gemaakt">Afspraak gemaakt</SelectItem>
                    <SelectItem value="geen_interesse">Geen interesse</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  min={0}
                  value={activityForm.duration_minutes || ''}
                  onChange={e => setActivityForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))}
                  placeholder="Duur (minuten)"
                />

                <Textarea
                  value={activityForm.note}
                  onChange={e => setActivityForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Notitie..."
                  rows={3}
                />
              </div>

              <Button onClick={logActivity} disabled={syncing} className="w-full">
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                {syncing ? 'Synchroniseren...' : 'Activiteit loggen & sync naar Pipedrive'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
