import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addMonths, format } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import { Wallet, TrendingUp, TrendingDown, Hourglass } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useCashPositions } from '@/hooks/useCash';
import { useContracts, monthlyValue } from '@/hooks/useContracts';
import { useInvoices, displayStatus } from '@/hooks/useInvoices';
import { useFinancials } from '@/hooks/useFinancials';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const fmt = (v: number) => `€${Math.round(v || 0).toLocaleString('nl')}`;

// Normalise a company_financials period's amount to a monthly figure.
function toMonthly(period: string, amount: number): number {
  if (/^\d{4}$/.test(period)) return amount / 12;          // year
  if (/Q[1-4]/i.test(period)) return amount / 3;            // quarter
  return amount;                                            // month (YYYY-MM) or unknown
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

export default function PrognosePage() {
  const { isAllView, allOrgIds, current } = useOrganization();
  const orgIds = isAllView ? allOrgIds : current ? [current.id] : [];
  const { data: cash } = useCashPositions(orgIds);
  const { data: contracts } = useContracts(orgIds);
  const { data: invoices } = useInvoices(orgIds);
  const { data: financials } = useFinancials(orgIds);
  const { data: stripe } = useStripeMrr();

  // ── Derived defaults from live data ──────────────────────────
  const seen = new Set<string>();
  let computedCash = 0;
  for (const c of cash ?? []) { const k = `${c.org_id}::${c.account}`; if (seen.has(k)) continue; seen.add(k); computedCash += Number(c.balance); }

  const stripeMrr = stripe?.configured ? (stripe.mrr ?? 0) / 100 : 0;
  const contractMrr = (contracts ?? []).reduce((s, c) => s + monthlyValue(c), 0);
  const computedIncome = stripeMrr + contractMrr;

  // Latest period's costs, normalised to a month.
  const latestFin = (financials ?? [])[0];
  const computedCosts = latestFin ? toMonthly(latestFin.period, Number(latestFin.costs)) : 0;

  const openInvoices = (invoices ?? []).filter(i => displayStatus(i) !== 'paid').reduce((s, i) => s + Number(i.amount), 0);

  // ── Editable assumptions (track the data until the user overrides) ──
  const [startOv, setStartOv] = useState<string | null>(null);
  const [incomeOv, setIncomeOv] = useState<string | null>(null);
  const [costsOv, setCostsOv] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(6);
  const [withInvoices, setWithInvoices] = useState(true);

  const start = startOv !== null ? Number(startOv) || 0 : computedCash;
  const income = incomeOv !== null ? Number(incomeOv) || 0 : computedIncome;
  const costs = costsOv !== null ? Number(costsOv) || 0 : computedCosts;
  const net = income - costs;

  const series = useMemo(() => {
    const out = [{ label: format(new Date(), 'MMM yy', { locale: nl }), saldo: Math.round(start), instroom: 0, uitstroom: 0 }];
    let bal = start;
    for (let i = 1; i <= horizon; i++) {
      const instroom = income + (i === 1 && withInvoices ? openInvoices : 0);
      const uitstroom = costs;
      bal += instroom - uitstroom;
      out.push({
        label: format(addMonths(new Date(), i), 'MMM yy', { locale: nl }),
        saldo: Math.round(bal), instroom: Math.round(instroom), uitstroom: Math.round(uitstroom),
      });
    }
    return out;
  }, [start, income, costs, horizon, withInvoices, openInvoices]);

  const endBalance = series[series.length - 1]?.saldo ?? start;

  // Runway: first month the projected balance goes below zero.
  const runwayMonth = series.findIndex((p, i) => i > 0 && p.saldo < 0);
  const runway = net >= 0 ? null : runwayMonth === -1 ? `> ${horizon} mnd` : `${runwayMonth} mnd`;

  const input = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={e => onChange(e.target.value)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  const kpis = [
    { label: 'Startsaldo', value: fmt(start), icon: Wallet, tint: 'text-emerald-500' },
    { label: 'Netto p/m', value: fmt(net), icon: net >= 0 ? TrendingUp : TrendingDown, tint: net >= 0 ? 'text-emerald-500' : 'text-rose-500' },
    { label: `Eindsaldo na ${horizon} mnd`, value: fmt(endBalance), icon: Wallet, tint: endBalance >= 0 ? 'text-emerald-500' : 'text-rose-500' },
    { label: 'Runway', value: runway ?? 'Positief', icon: Hourglass, tint: runway ? 'text-amber-500' : 'text-emerald-500' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <p className="text-sm text-muted-foreground">
        Cashflow-prognose{isAllView ? ' · alle labels' : current ? ` · ${current.name}` : ''} — startsaldo uit bunq, projectie op je terugkerende omzet en kosten.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <k.icon className={`h-4 w-4 ${k.tint}`} />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {net < 0 && (
        <Card className="border-amber-300">
          <CardContent className="p-4 text-sm text-amber-700 dark:text-amber-400">
            Je geeft maandelijks {fmt(-net)} meer uit dan er binnenkomt. Bij gelijkblijvende cijfers is je cash {runway === `> ${horizon} mnd` ? `na ${horizon} maanden nog positief` : `over ${runway} op`}.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Verwacht saldo</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={48} />
                <Tooltip formatter={(v: number) => fmt(v)} labelClassName="text-foreground" contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#saldoFill)" name="Saldo" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Aannames</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {input('Startsaldo (€)', startOv ?? String(Math.round(computedCash)), setStartOv, 'Live uit bunq')}
            {input('Inkomsten p/m (€)', incomeOv ?? String(Math.round(computedIncome)), setIncomeOv, 'Stripe + contracten')}
            {input('Kosten p/m (€)', costsOv ?? String(Math.round(computedCosts)), setCostsOv, 'Uit Omzet & Resultaat')}
            {input('Horizon (mnd)', String(horizon), v => setHorizon(Math.max(1, Math.min(36, Number(v) || 6))))}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={withInvoices} onCheckedChange={setWithInvoices} id="inv" />
            <Label htmlFor="inv" className="font-normal">Openstaande facturen ({fmt(openInvoices)}) meenemen in maand 1</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Per maand</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                  <th className="text-left font-medium py-2">Maand</th>
                  <th className="text-right font-medium">Instroom</th>
                  <th className="text-right font-medium">Uitstroom</th>
                  <th className="text-right font-medium">Eindsaldo</th>
                </tr>
              </thead>
              <tbody>
                {series.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">{p.label}{i === 0 ? ' (nu)' : ''}</td>
                    <td className="text-right tabular-nums text-emerald-600">{i === 0 ? '—' : fmt(p.instroom)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{i === 0 ? '—' : fmt(p.uitstroom)}</td>
                    <td className={`text-right tabular-nums font-medium ${p.saldo < 0 ? 'text-rose-600' : ''}`}>{fmt(p.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Een vooruitblik, geen boekhouding: het projecteert je huidige cash met gelijkblijvende terugkerende omzet en kosten. Pas de aannames aan om scenario's te vergelijken. Kosten komen uit de laatste periode in Omzet & Resultaat — vul die in voor een scherpere prognose.
      </p>
    </div>
  );
}
