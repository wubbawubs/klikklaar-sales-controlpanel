import { useEffect, useState } from 'react';
import { CloserKanban } from '@/components/closer/CloserKanban';
import { Handshake, TrendingUp, Trophy, Euro, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { useOrgId } from '@/hooks/useOrgId';

interface KPIs {
  total: number;
  active: number;
  deals: number;
  totalValue: number;
  scheduledThisWeek: number;
}

export default function CloserCRMPage() {
  const [kpis, setKpis] = useState<KPIs>({ total: 0, active: 0, deals: 0, totalValue: 0, scheduledThisWeek: 0 });
  const orgId = useOrgId();

  useEffect(() => {
    load();
    const channel = supabase
      .channel('closer-page-kpis')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closer_appointments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function load() {
    const rows = await fetchAll<any>('closer_appointments', (q) => {
      let qq = q.select('status, deal_value_eur, scheduled_at, organization_id');
      if (orgId) qq = qq.eq('organization_id', orgId);
      return qq;
    });
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const k: KPIs = {
      total: rows.length,
      active: rows.filter(r => !['deal', 'no_deal'].includes(r.status)).length,
      deals: rows.filter(r => r.status === 'deal').length,
      totalValue: rows.filter(r => r.status === 'deal').reduce((s, r) => s + (Number(r.deal_value_eur) || 0), 0),
      scheduledThisWeek: rows.filter(r => {
        if (!r.scheduled_at) return false;
        const d = new Date(r.scheduled_at);
        return d >= now && d <= weekAhead;
      }).length,
    };
    setKpis(k);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Handshake className="h-[18px] w-[18px] text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-page text-foreground">Closer CRM</h1>
            <p className="text-sm text-muted-foreground">Jouw afspraken via Calendly, ingedeeld per status.</p>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile icon={TrendingUp} label="Actief in pipeline" value={kpis.active.toString()} />
        <KpiTile icon={Calendar} label="Gepland deze week" value={kpis.scheduledThisWeek.toString()} />
        <KpiTile icon={Trophy} label="Deals gewonnen" value={kpis.deals.toString()} accent="emerald" />
        <KpiTile icon={Euro} label="Deal waarde" value={`€ ${kpis.totalValue.toLocaleString('nl-NL')}`} accent="emerald" />
        <KpiTile icon={Handshake} label="Totaal" value={kpis.total.toString()} />
      </div>

      <CloserKanban />
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: 'emerald' }) {
  const accentClass = accent === 'emerald' ? 'border-emerald-500/30' : 'border-border/60';
  const iconClass = accent === 'emerald' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-primary bg-primary/10';
  return (
    <div className={`rounded-xl border ${accentClass} bg-card shadow-card p-3.5 flex items-center gap-3`}>
      <div className={`h-9 w-9 rounded-lg ${iconClass} flex items-center justify-center shrink-0`}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold text-foreground tabular-nums truncate">{value}</p>
      </div>
    </div>
  );
}
