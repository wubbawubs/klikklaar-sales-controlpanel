import { useMemo } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinanceCompanies, useFinanceMonthly, useFinanceTargets } from '@/hooks/useFinance';
import { applyShare } from '@/lib/finance/aggregate';
import { eur } from '@/lib/finance/format';
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

  const num = 'px-4 py-2 text-right tabular-nums';
  const th = 'px-4 py-3 text-right font-medium text-muted-foreground';
  const cell = (n: number | null, negative = false) => (
    <td className={`${num} ${negative && n !== null && n < 0 ? 'text-rose-600 dark:text-rose-300' : ''}`}>{eur(n)}</td>
  );

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium">Omzet {year} vs vorig jaar vs target</h3>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows.map((r) => ({ label: r.label, [String(year)]: r.revenue, [String(year - 1)]: r.prev, Target: r.target }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => eur(v)} />
              <Legend />
              <Line type="monotone" dataKey={String(year)} stroke="#14a38b" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey={String(year - 1)} stroke="#9ca3af" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="Target" stroke="#b5452f" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Maand</th>
              <th className={th}>Omzet</th>
              <th className={th}>Target</th>
              <th className={th}>Kosten</th>
              <th className={th}>Resultaat</th>
              <th className={th}>Vorig jaar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`maand-${r.key.slice(0, 7)}`} className="border-b last:border-0">
                <td className="px-4 py-2 capitalize">{r.label}</td>
                {cell(r.revenue)}{cell(r.target)}{cell(r.costs)}{cell(r.result, true)}{cell(r.prev)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-testid="totaal-ytd" className="border-t-2 font-semibold">
              <td className="px-4 py-2">Totaal YTD</td>
              {cell(total.revenue)}{cell(total.target)}{cell(total.costs)}{cell(total.result, true)}{cell(total.prev)}
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
