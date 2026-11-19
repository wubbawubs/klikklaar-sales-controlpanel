import { useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Bar, CartesianGrid, ComposedChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { KpiTile } from '@/components/finance/KpiTile';
import {
  useFinanceBank, useFinanceCompanies, useFinanceMonthly, useFinanceOpenItems, useFinanceTargets,
} from '@/hooks/useFinance';
import { applyShare, companySummary, groupSummary, type CompanySummary } from '@/lib/finance/aggregate';
import { eur } from '@/lib/finance/format';
import { useFinanceFilter } from './FinanceFilter';

// Kleuren volgen de CRM-thematokens (--success, --primary, --warning, --destructive).
const C = {
  success: '#25a87a',
  primary: '#8ccfb8', // lichtere tint: bijna op target, duidelijk anders dan "gehaald"
  warning: '#f2801f',
  danger: '#dc3c3c',
  muted: '#9ca3af',
};

const HEALTH: Record<CompanySummary['health'], { color: string; label: string; badge: string }> = {
  good: { color: C.success, label: 'Op koers', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  warning: { color: C.warning, label: 'Let op', badge: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  critical: { color: C.danger, label: 'Actie nodig', badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  unknown: { color: C.muted, label: 'Geen data', badge: 'bg-muted text-muted-foreground' },
};

/** Korte reden achter de status, zodat "Let op" niet raadselachtig is. Volgt de drempels uit aggregate.ts. */
function healthReason(s: CompanySummary, minBuffer: number): string | null {
  if (s.health === 'unknown' || s.health === 'good') return null;
  const reasons: string[] = [];
  if (s.health === 'critical' && s.bank !== null && s.bank < minBuffer) reasons.push('onder buffer');
  if (s.targetPct !== null && s.targetPct < (s.health === 'critical' ? 0.6 : 0.85)) reasons.push('achter op target');
  if (s.receivables > 0 && s.overdue > 0.25 * s.receivables) reasons.push('veel te laat');
  return reasons.length ? reasons.join(' · ') : s.health === 'critical' ? 'sync mislukt' : null;
}

/** Kleur van een omzetbalk: hoe ver ten opzichte van de target. */
function targetColor(p: number | null): string {
  if (p === null) return C.muted;
  if (p >= 1) return C.success;
  if (p >= 0.85) return C.primary;
  if (p >= 0.6) return C.warning;
  return C.danger;
}

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
      pct: s.targetPct,
      color: targetColor(s.targetPct),
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
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Omzet {monthName} tegenover target</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <LegendDot color={C.success} label="≥ 100%" />
            <LegendDot color={C.primary} label="85–100%" />
            <LegendDot color={C.warning} label="60–85%" />
            <LegendDot color={C.danger} label="< 60%" />
            <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-foreground" />target</span>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen omzet of target voor deze maand.</p>
        ) : (
          <div style={{ height: Math.max(120, chartData.length * 44 + 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} layout="vertical" barGap={-16} margin={{ left: 8, right: 64 }}>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v: number) => eur(v)} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" width={110} fontSize={12} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                <Tooltip formatter={(v: number) => eur(v)} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                {/* Grijze achtergrondbalk tot de target: het gat tot de target is zo direct zichtbaar */}
                <Bar dataKey="target" name="Target" barSize={16} fill="hsl(var(--muted))" radius={3} isAnimationActive={false} />
                <Bar dataKey="revenue" name="Omzet" barSize={16} radius={3} isAnimationActive={false}>
                  {chartData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  <LabelList
                    dataKey="pct"
                    position="right"
                    fontSize={11}
                    fill="hsl(var(--muted-foreground))"
                    formatter={(v: number | null) => (v === null ? 'geen target' : pct(v))}
                  />
                </Bar>
                <Bar
                  dataKey="target"
                  name="Target"
                  barSize={16}
                  fill="transparent"
                  isAnimationActive={false}
                  shape={(p: { x: number; y: number; width: number; height: number }) => (
                    <line x1={p.x + p.width} x2={p.x + p.width} y1={p.y - 4} y2={p.y + p.height + 4} stroke="hsl(var(--foreground))" strokeWidth={2} />
                  )}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ s, c }) => {
          const h = HEALTH[s.health];
          const p = s.targetPct;
          const reason = healthReason(s, applyShare(c.min_buffer, c, mode));
          return (
            <div
              key={s.companyId}
              data-testid={`company-card-${s.companyId}`}
              className="overflow-hidden rounded-xl border border-l-4 bg-card text-sm shadow-sm"
              style={{ borderLeftColor: h.color }}
            >
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <span className="font-semibold">{s.name}</span>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${h.badge}`}>
                  {h.label}{reason && <span className="font-normal opacity-80"> · {reason}</span>}
                </span>
              </div>
              {s.health === 'unknown' && (
                <div className="border-b px-4 py-1.5 text-xs text-muted-foreground">nog niet gesynchroniseerd</div>
              )}
              <div className="px-4 pt-3">
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Omzet {monthName}</span>
                  <span className="tabular-nums">
                    <span className="font-medium text-foreground">{eur(s.revenueMonth)}</span>
                    {s.targetMonth !== null && <> / {eur(s.targetMonth)}</>}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.round((p ?? 0) * 100))}%`, background: targetColor(p) }}
                  />
                </div>
              </div>
              <dl className="divide-y px-4 py-1">
                <Line label="Bank" value={eur(s.bank)} />
                <Line label="Resultaat YTD" value={eur(s.resultYtd)} negative={s.resultYtd !== null && s.resultYtd < 0} />
                <Line
                  label="Open deb."
                  value={eur(s.receivables)}
                  sub={s.overdue > 0 ? `${eur(s.overdue)} te laat` : undefined}
                />
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function Line({ label, value, sub, negative }: { label: string; value: React.ReactNode; sub?: string; negative?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <div className={`font-semibold tabular-nums ${negative ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>{value}</div>
        {sub && <div className="text-xs font-medium tabular-nums text-red-600 dark:text-red-400">{sub}</div>}
      </dd>
    </div>
  );
}
