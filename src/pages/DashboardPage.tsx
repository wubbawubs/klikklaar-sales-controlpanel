import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { subWeeks } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import SEPersonalDashboard from '@/pages/SEPersonalDashboard';
import SEHealthBar from '@/components/dashboard/SEHealthBar';
import { useHealthCheck } from '@/hooks/useHealthCheck';
import {
  Users, Package, CheckCircle, AlertTriangle, Plug, ClipboardCheck,
  Target, PhoneCall, Handshake, Trophy, CreditCard, Eye, Pencil, Play, Download, Trash2, Loader2,
} from 'lucide-react';
import type { SalesExecutive, Workspace, IntegrationConfig } from '@/types/database';
import DealValueChart from '@/components/dashboard/DealValueChart';
import WeeklyActivitiesChart from '@/components/dashboard/WeeklyActivitiesChart';
import DashboardDateFilter from '@/components/dashboard/DashboardDateFilter';
import AdminSignalsOverview from '@/components/dashboard/AdminSignalsOverview';
import AdminNBAOverview from '@/components/dashboard/AdminNBAOverview';
import HealthEventsLog from '@/components/dashboard/HealthEventsLog';
import PerRepAnalytics from '@/components/dashboard/PerRepAnalytics';
import LeadHealthOverview from '@/components/dashboard/LeadHealthOverview';

interface SERow extends SalesExecutive {
  workspace?: Workspace;
  integrations?: IntegrationConfig[];
}

export default function DashboardPage() {
  const { toast } = useToast();
  const { user, isAdmin, roles, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  const isCoachOrAdmin = isAdmin || roles.includes('coach');
  const isCloser = roles.includes('closer');

  // Closer (without admin/coach) goes straight to /closer
  if (isCloser && !isCoachOrAdmin && !roles.includes('sales_executive')) {
    return <Navigate to="/closer" replace />;
  }

  if (!isCoachOrAdmin) {
    return <SEPersonalDashboard />;
  }

  return <AdminDashboard user={user} toast={toast} />;
}

function AdminDashboard({ user, toast }: { user: any; toast: any }) {
  const [ses, setSes] = useState<SERow[]>([]);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    activeSEs: 0, draftWorkspaces: 0, readyWorkspaces: 0, failedJobs: 0,
    integrationErrors: 0, eodExpected: 0, eodReceived: 0,
    openLeads: 0, callbacksToday: 0, openDeals: 0, wonDeals: 0, activeSubscriptions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState({ from: subWeeks(new Date(), 8), to: new Date() });
  // Health check runs as admin — uses a dummy SE context for system-level checks
  const health = useHealthCheck('admin-system-check', 'Admin', true);

  const fetchData = async () => {
    const today = new Date().toISOString().split('T')[0];

    const [
      { data: seData },
      { data: wsData },
      { data: icData },
      { data: jobData },
      { data: eodData },
      { data: eventData },
      { count: openLeadsCount },
      { data: callbacksData },
      { count: openDealsCount },
      { count: wonDealsCount },
      { count: totalCallsCount },
    ] = await Promise.all([
      supabase.from('sales_executives').select('*'),
      supabase.from('workspaces').select('*'),
      supabase.from('integration_configs').select('*'),
      supabase.from('provisioning_jobs').select('*'),
      supabase.from('eod_submissions').select('*'),
      supabase.from('integration_events').select('*'),
      supabase.from('pipedrive_lead_assignments').select('id', { count: 'exact', head: true }).in('status', ['assigned']),
      supabase.from('calls').select('id').eq('outcome', 'callback').not('callback_date', 'is', null).lte('callback_date', today),
      supabase.from('pipedrive_lead_assignments').select('id', { count: 'exact', head: true }).in('status', ['assigned', 'contacted', 'qualified']),
      supabase.from('pipedrive_lead_assignments').select('id', { count: 'exact', head: true }).eq('status', 'won'),
      supabase.from('calls').select('id', { count: 'exact', head: true }),
    ]);

    const seList = (seData || []) as SalesExecutive[];
    const wsList = (wsData || []) as Workspace[];
    const icList = (icData || []) as IntegrationConfig[];

    const rows: SERow[] = seList.map(se => ({
      ...se,
      workspace: wsList.find(w => w.sales_executive_id === se.id),
      integrations: icList.filter(ic => {
        const ws = wsList.find(w => w.sales_executive_id === se.id);
        return ws && ic.workspace_id === ws.id;
      }),
    }));

    setStats({
      activeSEs: seList.filter(s => s.status === 'active').length,
      draftWorkspaces: wsList.filter(w => w.sharepoint_status === 'draft').length,
      readyWorkspaces: wsList.filter(w => ['ready', 'executed'].includes(w.sharepoint_status)).length,
      failedJobs: (jobData || []).filter(j => j.status === 'failed').length,
      integrationErrors: (eventData || []).filter(e => e.processing_status === 'failed').length,
      eodExpected: seList.filter(s => s.status === 'active').length,
      eodReceived: (eodData || []).filter(e => e.session_date === today && e.status !== 'pending').length,
      openLeads: openLeadsCount ?? 0,
      callbacksToday: (callbacksData || []).length,
      openDeals: openDealsCount ?? 0,
      wonDeals: wonDealsCount ?? 0,
      activeSubscriptions: totalCallsCount ?? 0,
    });

    setSes(rows);
    setLoading(false);
  };

  // Initial load + 10-minute auto-refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  const getIntegrationStatus = (row: SERow, provider: string) => {
    const ic = row.integrations?.find(i => i.provider === provider);
    return ic ? ic.status : 'not_configured';
  };

  const handleProvision = async (se: SERow) => {
    if (!se.workspace) {
      toast({ title: 'Geen workspace', description: 'Er is geen workspace geconfigureerd voor deze Sales Executive.', variant: 'destructive' });
      return;
    }
    setProvisioningId(se.id);
    try {
      const ws = se.workspace;
      const { data: job, error } = await supabase.from('provisioning_jobs').insert({
        workspace_id: ws.id,
        job_type: ws.provisioning_mode || 'design_only',
        status: 'pending',
      }).select().single();
      if (error) throw error;

      const newStatus = ws.provisioning_mode === 'controlled_execution' ? 'provisioning' : 'ready';
      await supabase.from('workspaces').update({ sharepoint_status: newStatus }).eq('id', ws.id);

      await supabase.from('audit_logs').insert({
        entity_type: 'provisioning_job',
        entity_id: job.id,
        action_type: 'create',
        actor_user_id: user?.id,
        after_json: { job_type: job.job_type, workspace_id: ws.id, se_name: se.full_name },
      });

      setSes(prev => prev.map(s => s.id === se.id ? { ...s, workspace: { ...ws, sharepoint_status: newStatus } } : s));
      toast({ title: 'Provisioning gestart', description: `Job aangemaakt voor ${se.full_name}.` });
    } catch (err: any) {
      toast({ title: 'Fout bij provisioning', description: err.message, variant: 'destructive' });
    } finally {
      setProvisioningId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-page text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overzicht van alle Sales Executive activiteiten</p>
        </div>
        <Link to="/sales-executives/new">
          <Button size="lg" className="w-full sm:w-auto">Nieuwe Sales Executive</Button>
        </Link>
      </div>

      {/* Health Monitor */}
      <SEHealthBar health={health} />

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Actieve SEs" value={stats.activeSEs} icon={Users} variant="info" />
        <StatCard title="Workspaces concept" value={stats.draftWorkspaces} icon={Package} />
        <StatCard title="Workspaces gereed" value={stats.readyWorkspaces} icon={CheckCircle} variant="success" />
        <StatCard title="Jobs mislukt" value={stats.failedJobs} icon={AlertTriangle} variant="destructive" />
        <StatCard title="Integratiefouten" value={stats.integrationErrors} icon={Plug} variant="warning" />
        <StatCard title="EOD verwacht" value={stats.eodExpected} icon={ClipboardCheck} />
        <StatCard title="EOD ontvangen" value={stats.eodReceived} icon={ClipboardCheck} variant="success" />
        <StatCard title="Open leads" value={stats.openLeads} icon={Target} />
        <StatCard title="Callbacks vandaag" value={stats.callbacksToday} icon={PhoneCall} variant="warning" />
        <StatCard title="Open deals" value={stats.openDeals} icon={Handshake} />
        <StatCard title="Gewonnen deals" value={stats.wonDeals} icon={Trophy} variant="success" />
        <StatCard title="Totaal calls" value={stats.activeSubscriptions} icon={CreditCard} variant="info" />
      </div>

      {/* Charts section */}
      <div className="space-y-4">
        <DashboardDateFilter from={chartRange.from} to={chartRange.to} onChange={setChartRange} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DealValueChart from={chartRange.from} to={chartRange.to} />
          <WeeklyActivitiesChart from={chartRange.from} to={chartRange.to} />
        </div>
      </div>

      <LeadHealthOverview />

      <PerRepAnalytics />

      <AdminNBAOverview />

      <AdminSignalsOverview />

      <HealthEventsLog />

      {/* SE Table */}
      <div className="bg-card rounded-xl border border-border/60 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className="text-section text-card-foreground">Sales Executives</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Naam</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">E-mail</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Workspace</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Extern</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Pipedrive</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Exact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Qapitaal</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">EOD</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Provisioning</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Acties</th>
              </tr>
            </thead>
            <tbody>
              {ses.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Nog geen Sales Executives aangemaakt.{' '}
                    <Link to="/sales-executives/new" className="text-primary hover:underline font-medium">Maak de eerste aan</Link>
                  </td>
                </tr>
              ) : (
                ses.map(se => (
                  <tr key={se.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{se.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{se.email}</td>
                    <td className="px-4 py-3"><StatusBadge status={se.status} /></td>
                    <td className="px-4 py-3">
                      {se.workspace ? <StatusBadge status={se.workspace.sharepoint_status} /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{se.external_access_required ? 'Ja' : 'Nee'}</td>
                    <td className="px-4 py-3"><StatusBadge status={getIntegrationStatus(se, 'pipedrive')} /></td>
                    <td className="px-4 py-3"><StatusBadge status={getIntegrationStatus(se, 'exact')} /></td>
                    <td className="px-4 py-3"><StatusBadge status={getIntegrationStatus(se, 'qapitaal')} /></td>
                    <td className="px-4 py-3"><StatusBadge status={getIntegrationStatus(se, 'typeform')} /></td>
                    <td className="px-4 py-3">
                      {se.workspace ? <StatusBadge status={se.workspace.sharepoint_status} /> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/sales-executives/${se.id}`}>
                          <Button variant="ghost" size="icon" title="Bekijken"><Eye className="h-4 w-4" /></Button>
                        </Link>
                        <Link to={`/sales-executives/${se.id}/edit`}>
                          <Button variant="ghost" size="icon" title="Bewerken"><Pencil className="h-4 w-4" /></Button>
                        </Link>
                        <Button variant="ghost" size="icon" title="Provisioneren" onClick={() => handleProvision(se)} disabled={provisioningId === se.id}>
                          {provisioningId === se.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" title="Exporteren"><Download className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Verwijderen"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
