import { useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Bar, CartesianGrid, ComposedChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KpiTile } from '@/components/finance/KpiTile';
import {
  useFinanceBank, useFinanceCompanies, useFinanceMonthly, useFinanceOpenItems, useFinanceTargets,
} from '@/hooks/useFinance';
import { companySummary, groupSummary, type CompanySummary } from '@/lib/finance/aggregate';
import { eur } from '@/lib/finance/format';
import { useFinanceFilter } from './FinanceFilter';

const HEALTH_COLOR: Record<CompanySummary['health'], string> = {
  good: '#14a38b',
  warning: '#d9822b',
  critical: '#b5452f',
  unknown: '#9ca3af',
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function OverzichtPage() {
  const { companyId, mode, month } = useFinanceFilter();
  const year = Number(month.slice(0, 4));

  const companiesQ = useFinanceCompanies();
  const monthlyQ = useFinanceMonthly([year - 1, year]);
  const bankQ = useFinanceBank();
  const receivablesQ = useFinanceOpenItems('receivable');
  const targetsQ = useFinanceTargets(year);

  const loading = [companiesQ, monthlyQ, bankQ, receivablesQ, targetsQ].some((q) => q.isLoading);

  const rows = useMemo(() => {
    // R3: alleen niet-uitgesloten bedrijven, daarna het gekozen bedrijf.
    const visible = (companiesQ.data ?? []).filter((c) => !c.excluded && (companyId === 'all' || c.id === companyId));
    const today = format(new Date(), 'yyyy-MM-dd');
    return visible.map((c) =>
      companySummary(
        c,
        {
          monthly: (monthlyQ.data ?? []).filter((r) => r.company_id === c.id),
          bank: (bankQ.data ?? []).filter((b) => b.company_id === c.id),
          items: (receivablesQ.data ?? []).filter((i) => i.company_id === c.id),
          targets: (targetsQ.data ?? []).filter((t) => t.company_id === c.id),
        },
        { month, today, mode },
      ),
    ).map((s, i) => ({ s, c: visible[i] }));
  }, [companiesQ.data, monthlyQ.data, bankQ.data, receivablesQ.data, targetsQ.data, companyId, month, mode]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const summaries = rows.map((r) => r.s);
  const g = groupSummary(summaries);
  const monthName = format(new Date(`${month.slice(0, 7)}-01T12:00:00`), 'LLLL', { locale: nl });
  const isGroup = companyId === 'all';

  const ytdGrowth = g.revenueYtd !== null && g.revenuePrevYtd ? g.revenueYtd / g.revenuePrevYtd - 1 : null;
  const margin = g.resultYtd !== null && g.revenueYtd ? g.resultYtd / g.revenueYtd : null;

  const chartData = rows
    .filter(({ s }) => s.revenueMonth !== null || s.targetMonth !== null)
    .map(({ s }) => ({
      name: s.name,
      revenue: s.revenueMonth ?? 0,
      target: s.targetMonth ?? 0,
      color: HEALTH_COLOR[s.health],
    }));

  return (
    <div className="space-y-6 p-6">
      {isGroup && (
        <div className="text-xs text-muted-foreground">
          Groepstotaal excl. intercompany · {summaries.length} {summaries.length === 1 ? 'bedrijf' : 'bedrijven'}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Banksaldo" value={eur(g.bank)} hint="alle rekeningen" />
        <KpiTile
          label={`Omzet ${monthName} vs target`}
          value={eur(g.revenueMonth)}
          hint={g.targetMonth !== null ? `${g.targetPct !== null ? `${pct(g.targetPct)} van ` : ''}${eur(g.targetMonth)}` : 'geen target'}
        />
        <KpiTile
          label="Omzet YTD"
          value={eur(g.revenueYtd)}
          hint={ytdGrowth !== null ? `${ytdGrowth >= 0 ? '+' : ''}${Math.round(ytdGrowth * 100)}% vs vorig jaar` : 'geen vergelijking'}
        />
        <KpiTile
          label="Resultaat YTD"
          value={eur(g.resultYtd)}
          tone={g.resultYtd !== null && g.resultYtd < 0 ? 'negative' : 'default'}
          hint={margin !== null ? `${Math.round(margin * 100)}% marge` : undefined}
        />
        <KpiTile label="Open debiteuren" value={eur(g.receivables)} hint={`${eur(g.overdue)} te laat`} />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium">
          Omzet {monthName} tegenover target <span className="text-xs text-muted-foreground">(streep = target)</span>
        </h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen omzet of target voor deze maand.</p>
        ) : (
          <div style={{ height: Math.max(120, chartData.length * 44 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} layout="vertical" barGap={-14} margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v: number) => eur(v)} fontSize={11} />
                <YAxis type="category" dataKey="name" width={110} fontSize={11} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <Bar dataKey="revenue" name="Omzet" barSize={14} isAnimationActive={false}>
                  {chartData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Bar>
                <Bar
                  dataKey="target"
                  name="Target"
                  barSize={14}
                  fill="transparent"
                  isAnimationActive={false}
                  shape={(p: { x: number; y: number; width: number; height: number }) => (
                    <line x1={p.x + p.width} x2={p.x + p.width} y1={p.y - 3} y2={p.y + p.height + 3} stroke="currentColor" strokeWidth={2} />
                  )}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => (
          <div key={s.companyId} data-testid={`company-card-${s.companyId}`} className="rounded-xl border bg-card p-4 text-sm">
            <div className="mb-2 flex items-center justify-between font-medium">
              {s.name}
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLOR[s.health] }} title={s.health} />
            </div>
            {s.health === 'unknown' && <div className="mb-2 text-xs text-muted-foreground">nog niet gesynchroniseerd</div>}
            <Line label="Bank" value={eur(s.bank)} />
            <Line label="Resultaat YTD" value={eur(s.resultYtd)} />
            <Line
              label="Open deb."
              value={
                <>
                  {eur(s.receivables)}
                  {s.overdue > 0 && <> · <b className="text-rose-600 dark:text-rose-300">{eur(s.overdue)} te laat</b></>}
                </>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-0.5 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}
