import { useQuery } from '@tanstack/react-query';
import { Euro, Repeat, Trophy, Wallet, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useCashPositions } from '@/hooks/useCash';
import { useContracts, monthlyValue } from '@/hooks/useContracts';
import { useInvoices, displayStatus } from '@/hooks/useInvoices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fmt = (v: number) => `€${Math.round(v || 0).toLocaleString('nl')}`;

interface OrgRoll { won: number; oneTime: number; mrr: number }

// Won-deal revenue rollup (one-time fees + recurring) per org.
function useFinance(orgIds: string[]) {
  return useQuery({
    queryKey: ['finance', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const [st, dl, fe] = await Promise.all([
        supabase.from('pipeline_stages').select('id, name, org_id').in('org_id', orgIds),
        supabase.from('deals').select('id, org_id, stage_id, won_at, value_eur').in('org_id', orgIds),
        supabase.from('deal_fees').select('deal_id, org_id, amount, kind, interval').in('org_id', orgIds),
      ]);
      const stages = st.data ?? [], deals = dl.data ?? [], fees = fe.data ?? [];
      const wonStageIds = new Set(stages.filter(s => /won|gewonnen/i.test(s.name ?? '')).map(s => s.id));
      const isWon = (d: { stage_id: string | null; won_at: string | null }) => (d.stage_id && wonStageIds.has(d.stage_id)) || !!d.won_at;
      const wonIds = new Set(deals.filter(isWon).map(d => d.id));
      const dealsWithFees = new Set(fees.map(f => f.deal_id));

      const per = new Map<string, OrgRoll>();
      for (const id of orgIds) per.set(id, { won: 0, oneTime: 0, mrr: 0 });
      for (const d of deals) if (isWon(d)) { const r = per.get(d.org_id); if (r) r.won++; }
      for (const f of fees) {
        if (!wonIds.has(f.deal_id)) continue;
        const r = per.get(f.org_id); if (!r) continue;
        const a = Number(f.amount) || 0;
        if (f.kind === 'recurring') r.mrr += f.interval === 'year' ? a / 12 : a;
        else r.oneTime += a;
      }
      for (const d of deals) {
        if (!isWon(d) || dealsWithFees.has(d.id)) continue;
        const r = per.get(d.org_id); if (r) r.oneTime += Number(d.value_eur) || 0;
      }
      return { per };
    },
  });
}

interface StripeSummary { configured: boolean; mrr?: number }
function useStripeMrr() {
  return useQuery({
    queryKey: ['stripe-summary'],
    queryFn: async (): Promise<StripeSummary> => {
      const { data, error } = await supabase.functions.invoke('stripe-summary');
      if (error) throw error;
      return data as StripeSummary;
    },
    staleTime: 60_000,
  });
}

export default function FinancePage() {
  const { isAllView, allOrgIds, current, available } = useOrganization();
  const orgIds = isAllView ? allOrgIds : current ? [current.id] : [];
  const { data, isLoading } = useFinance(orgIds);
  const { data: cash } = useCashPositions(orgIds);
  const { data: contracts } = useContracts(orgIds);
  const { data: invoices } = useInvoices(orgIds);
  const { data: stripe } = useStripeMrr();
  const per = data?.per;

  const rows = orgIds
    .map(id => ({ id, name: available.find(o => o.id === id)?.name ?? id, ...(per?.get(id) ?? { won: 0, oneTime: 0, mrr: 0 }) }))
    .sort((a, b) => (b.oneTime + b.mrr * 12) - (a.oneTime + a.mrr * 12));
  const tot = rows.reduce((s, r) => ({ won: s.won + r.won, oneTime: s.oneTime + r.oneTime, mrr: s.mrr + r.mrr }), { won: 0, oneTime: 0, mrr: 0 });

  // Cash = latest snapshot per (org, account); rows arrive newest-first.
  const seen = new Set<string>();
  let totalCash = 0;
  for (const c of cash ?? []) { const k = `${c.org_id}::${c.account}`; if (seen.has(k)) continue; seen.add(k); totalCash += Number(c.balance); }

  const contractMrr = (contracts ?? []).reduce((s, c) => s + monthlyValue(c), 0);
  const stripeMrr = stripe?.configured ? (stripe.mrr ?? 0) / 100 : 0;
  const recurring = stripeMrr + contractMrr + tot.mrr;
  const openInvoices = (invoices ?? []).filter(i => displayStatus(i) !== 'paid').reduce((s, i) => s + Number(i.amount), 0);

  const kpis = [
    { label: 'Liquiditeit', value: fmt(totalCash), icon: Wallet },
    { label: 'Terugkerend p/m', value: fmt(recurring), icon: Repeat },
    { label: 'Openstaande facturen', value: fmt(openInvoices), icon: FileText },
    { label: 'Gewonnen omzet', value: fmt(tot.oneTime), icon: Trophy },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <p className="text-sm text-muted-foreground">
        Overzicht{isAllView ? ' · alle labels' : current ? ` · ${current.name}` : ''}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <k.icon className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Stripe MRR', value: fmt(stripeMrr) },
          { label: 'Contracten p/m', value: fmt(contractMrr) },
          { label: 'ARR (terugkerend)', value: fmt(recurring * 12) },
          { label: 'Gewonnen deals', value: String(tot.won) },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">{k.label}</p>
              <p className="text-xl font-semibold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(isAllView || rows.length > 1) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Per label</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Laden…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                      <th className="text-left font-medium py-2">Label</th>
                      <th className="text-right font-medium">Gewonnen</th>
                      <th className="text-right font-medium">Eenmalig</th>
                      <th className="text-right font-medium">MRR</th>
                      <th className="text-right font-medium">ARR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2.5 font-medium">{r.name}</td>
                        <td className="text-right tabular-nums">{r.won}</td>
                        <td className="text-right tabular-nums">{fmt(r.oneTime)}</td>
                        <td className="text-right tabular-nums text-emerald-600">{fmt(r.mrr)}</td>
                        <td className="text-right tabular-nums">{fmt(r.mrr * 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Eén overzicht over alle labels: liquiditeit uit bunq, terugkerende omzet uit Stripe + contracten + gewonnen deals, openstaande facturen en gewonnen omzet. Open een tab hierboven voor de details. Cashflow-prognose volgt als losse tab.
      </p>
    </div>
  );
}
