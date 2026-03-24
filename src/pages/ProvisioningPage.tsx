import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProvisioningJob, Workspace, SalesExecutive } from '@/types/database';

export default function ProvisioningPage() {
  const [jobs, setJobs] = useState<(ProvisioningJob & { ws_name?: string; se_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [jobRes, wsRes, seRes] = await Promise.all([
        supabase.from('provisioning_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('workspaces').select('*'),
        supabase.from('sales_executives').select('*'),
      ]);
      const wsList = (wsRes.data || []) as Workspace[];
      const seList = (seRes.data || []) as SalesExecutive[];
      const mapped = (jobRes.data || []).map(j => {
        const ws = wsList.find(w => w.id === j.workspace_id);
        const se = ws ? seList.find(s => s.id === ws.sales_executive_id) : null;
        return { ...j, ws_name: ws?.workspace_name, se_name: se?.full_name };
      });
      setJobs(mapped);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Provisioning</h1>
        <p className="text-muted-foreground text-sm mt-1">Overzicht van alle provisioning-jobs</p>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground p-8">Laden...</div>
      ) : jobs.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Nog geen provisioning-jobs. Start een provisioning via de Sales Executive detailpagina of artifact generator.
        </CardContent></Card>
      ) : (
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Sales Executive</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Workspace</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 text-muted-foreground">{new Date(j.created_at).toLocaleString('nl-NL')}</td>
                  <td className="p-3 font-medium">{j.se_name || '—'}</td>
                  <td className="p-3 text-muted-foreground">{j.ws_name || '—'}</td>
                  <td className="p-3">{j.job_type}</td>
                  <td className="p-3"><StatusBadge status={j.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
