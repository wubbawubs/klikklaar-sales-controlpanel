import { useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Chip } from '@/components/finance/KpiStrip';
import { Section } from '@/components/finance/Section';
import { useFinanceCompanies, useFinanceMonthly, useFinanceTargets } from '@/hooks/useFinance';
import { applyShare } from '@/lib/finance/aggregate';
import { eur } from '@/lib/finance/format';
import { pct, TABLE, targetTone, TONE_TEXT } from '@/lib/finance/ui';
import { cn } from '@/lib/utils';
import { useFinanceFilter } from './FinanceFilter';

interface Row {
  key: string; // 'YYYY-MM-01'
  label: string;
  revenue: number | null;
  target: number | null;
  costs: number | null;
  result: number | null;
  prev: number | null;
}

const add = (a: number | null, b: number) => (a === null ? b : a + b);

export default function OmzetResultaatPage() {
  const { companyId, mode, month } = useFinanceFilter();
  const year = Number(month.slice(0, 4));
  const companiesQ = useFinanceCompanies();
  const monthlyQ = useFinanceMonthly([year - 1, year]);
  const targetsQ = useFinanceTargets(year);
  const loading = companiesQ.isLoading || monthlyQ.isLoading || targetsQ.isLoading;

  const { rows, total } = useMemo(() => {
    // R3: alleen niet-uitgesloten bedrijven, daarna het gekozen bedrijf.
    const visible = (companiesQ.data ?? []).filter((c) => !c.excluded && (companyId === 'all' || c.id === companyId));
    const byId = new Map(visible.map((c) => [c.id, c]));
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      return {
        key: `${year}-${mm}-01`,
        label: format(new Date(year, i, 1), 'LLL', { locale: nl }),
        revenue: null, target: null, costs: null, result: null, prev: null,
      };
    });
    for (const r of monthlyQ.data ?? []) {
      const c = byId.get(r.company_id);
      if (!c) continue;
      const y = Number(r.month.slice(0, 4));
      const idx = Number(r.month.slice(5, 7)) - 1;
      if (y === year) {
        const row = rows[idx];
        row.revenue = add(row.revenue, applyShare(r.revenue, c, mode));
        row.costs = add(row.costs, applyShare(r.costs, c, mode));
        row.result = add(row.result, applyShare(r.revenue - r.costs, c, mode));
      } else if (y === year - 1) {
        rows[idx].prev = add(rows[idx].prev, applyShare(r.revenue, c, mode));
      }
    }
    for (const t of targetsQ.data ?? []) {
      const c = byId.get(t.company_id);
      if (!c || t.month.slice(0, 4) !== String(year)) continue;
      const row = rows[Number(t.month.slice(5, 7)) - 1];
      row.target = add(row.target, applyShare(t.target, c, mode));
    }
    const ytd = rows.filter((r) => r.key <= month);
    const sumOf = (k: 'revenue' | 'target' | 'costs' | 'result' | 'prev') =>
      ytd.reduce<number | null>((acc, r) => (r[k] === null ? acc : add(acc, r[k] as number)), null);
    return {
      rows,
      total: { revenue: sumOf('revenue'), target: sumOf('target'), costs: sumOf('costs'), result: sumOf('result'), prev: sumOf('prev') },
    };
  }, [companiesQ.data, monthlyQ.data, targetsQ.data, companyId, mode, month, year]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const cell = (n: number | null, negative = false) => (
    <td className={cn(TABLE.tdNum, negative && n !== null && n < 0 && TONE_TEXT.danger)}>{eur(n)}</td>
  );
  const vsTarget = (revenue: number | null, target: number | null) => {
    const p = revenue !== null && target ? revenue / target : null;
    return <td className={TABLE.tdNum}>{p === null ? '—' : <Chip tone={targetTone(p)}>{pct(p)}</Chip>}</td>;
  };
  const cur = String(year);
  const prev = String(year - 1);

  return (
    <div className="space-y-6 p-6">
      <Section
        title={`Omzet ${year} vs vorig jaar vs target`}
        description="Per maand, voor de gekozen bedrijven."
        actions={
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <LegendLine className="bg-primary" label={cur} />
            <LegendLine className="bg-muted-foreground/60" label={prev} />
            <LegendLine dashed label="Target" />
          </div>
        }
      >
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows.map((r) => ({ label: r.label, [cur]: r.revenue, [prev]: r.prev, Target: r.target }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => eur(v)} />
              <Area type="monotone" dataKey={cur} stroke="none" fill="hsl(var(--primary))" fillOpacity={0.08} connectNulls isAnimationActive={false} legendType="none" tooltipType="none" />
              <Line type="monotone" dataKey={prev} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="Target" stroke="hsl(var(--foreground))" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey={cur} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2.5, fill: 'hsl(var(--primary))' }} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Per maand" description={`Totaal YTD telt tot en met ${format(new Date(`${month.slice(0, 7)}-01T12:00:00`), 'LLLL', { locale: nl })}.`} flush>
        <table className={TABLE.table}>
          <thead>
            <tr className={TABLE.headRow}>
              <th className={TABLE.th}>Maand</th>
              <th className={TABLE.thNum}>Omzet</th>
              <th className={TABLE.thNum}>Target</th>
              <th className={TABLE.thNum}>vs target</th>
              <th className={TABLE.thNum}>Kosten</th>
              <th className={TABLE.thNum}>Resultaat</th>
              <th className={TABLE.thNum}>Vorig jaar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const current = r.key === month;
              const future = r.key > month;
              return (
                <tr
                  key={r.key}
                  data-testid={`maand-${r.key.slice(0, 7)}`}
                  aria-current={current ? 'date' : undefined}
                  className={cn(TABLE.row, current && 'bg-muted/50', future && 'text-muted-foreground')}
                >
                  <td className={cn(TABLE.td, 'capitalize', current && 'font-medium')}>{r.label}</td>
                  {cell(r.revenue)}{cell(r.target)}{vsTarget(r.revenue, r.target)}{cell(r.costs)}{cell(r.result, true)}{cell(r.prev)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr data-testid="totaal-ytd" className="h-11 border-t-2 border-foreground/15 bg-card font-semibold">
              <td className={TABLE.td}>Totaal YTD</td>
              {cell(total.revenue)}{cell(total.target)}{vsTarget(total.revenue, total.target)}{cell(total.costs)}{cell(total.result, true)}{cell(total.prev)}
            </tr>
          </tfoot>
        </table>
      </Section>
    </div>
  );
}

function LegendLine({ label, className, dashed }: { label: string; className?: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {dashed
        ? <span className="w-4 border-t-[1.5px] border-dashed border-foreground/40" />
        : <span className={cn('h-0.5 w-4 rounded-sm', className)} />}
      {label}
    </span>
  );
}
