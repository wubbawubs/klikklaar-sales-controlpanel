import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { EodSubmission, SalesExecutive } from '@/types/database';

export default function EodPage() {
  const [eods, setEods] = useState<(EodSubmission & { se_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [eodRes, seRes] = await Promise.all([
        supabase.from('eod_submissions').select('*').order('session_date', { ascending: false }),
        supabase.from('sales_executives').select('id, first_name, last_name, full_name'),
      ]);
      const ses = (seRes.data || []) as SalesExecutive[];
      const mapped = (eodRes.data || []).map(e => ({
        ...e,
        se_name: ses.find(s => s.id === e.sales_executive_id)?.full_name || 'Onbekend',
      }));
      setEods(mapped);
      setLoading(false);
    };
    fetch();
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const todayEods = eods.filter(e => e.session_date === today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">End of Day Beheer</h1>
        <p className="text-muted-foreground text-sm mt-1">Overzicht en opvolging van EOD-evaluaties</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vandaag ingediend</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{todayEods.filter(e => e.status !== 'pending').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Opvolging nodig</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{eods.filter(e => e.follow_up_required && e.follow_up_status !== 'completed').length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Totaal deze week</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{eods.length}</p></CardContent>
        </Card>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Laden...</div>
        ) : eods.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nog geen EOD-inzendingen. EOD's worden geregistreerd via Typeform of handmatig aangemaakt.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Sales Executive</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Opvolging</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Notities</th>
              </tr>
            </thead>
            <tbody>
              {eods.map(eod => (
                <tr key={eod.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{new Date(eod.session_date).toLocaleDateString('nl-NL')}</td>
                  <td className="p-3 font-medium">{eod.se_name}</td>
                  <td className="p-3"><StatusBadge status={eod.status} /></td>
                  <td className="p-3"><StatusBadge status={eod.follow_up_status} /></td>
                  <td className="p-3 text-muted-foreground">{eod.coach_notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
