import { useMemo, useState } from 'react';
import { format, getISOWeek, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Printer } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { FreshnessBadge } from '@/components/finance/FreshnessBadge';
import { Button } from '@/components/ui/button';
import {
  useFinanceBank, useFinanceCompanies, useFinanceFixedCosts, useFinanceMonthly, useFinanceOpenItems, useFinanceTargets,
} from '@/hooks/useFinance';
import { applyShare, companySummary, groupSummary } from '@/lib/finance/aggregate';
import { forecast13Weeks } from '@/lib/finance/forecast';
import { eur } from '@/lib/finance/format';
import { useFinanceFilter } from './FinanceFilter';

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export default function RapportagePage() {
  const filter = useFinanceFilter();
  const mode = filter.mode; // rapport volgt de aandeel-schakelaar
  // Eigen selectors, gestart op de huidige filterwaarden.
  const [companyId, setCompanyId] = useState<string>(filter.companyId);
  const [ym, setYm] = useState<string>(filter.month.slice(0, 7));
  const month = `${ym}-01`;
  const year = Number(ym.slice(0, 4));

  const companiesQ = useFinanceCompanies();
  const monthlyQ = useFinanceMonthly([year - 1, year]);
  const bankQ = useFinanceBank();
  const receivablesQ = useFinanceOpenItems('receivable');
  const payablesQ = useFinanceOpenItems('payable');
  const targetsQ = useFinanceTargets(year);
  const fixedQ = useFinanceFixedCosts();
  const loading = [companiesQ, monthlyQ, bankQ, receivablesQ, payablesQ, targetsQ, fixedQ].some((q) => q.isLoading);

  const data = useMemo(() => {
    // R3: alleen niet-uitgesloten bedrijven, daarna de keuze in het rapport.
    const all = (companiesQ.data ?? []).filter((c) => !c.excluded);
    const visible = all.filter((c) => companyId === 'all' || c.id === companyId);
    const ids = new Set(visible.map((c) => c.id));
    const byId = new Map(visible.map((c) => [c.id, c]));
    const today = format(new Date(), 'yyyy-MM-dd');
    const receivables = receivablesQ.data ?? [];
    const rows = visible.map((c) =>
      companySummary(
        c,
        {
          monthly: (monthlyQ.data ?? []).filter((r) => r.company_id === c.id),
          bank: (bankQ.data ?? []).filter((b) => b.company_id === c.id),
          items: receivables.filter((i) => i.company_id === c.id),
          targets: (targetsQ.data ?? []).filter((t) => t.company_id === c.id),
        },
        { month, today, mode },
      ),
    );
    const group = groupSummary(rows);

    const sh = (n: number, id: string) => applyShare(n, byId.get(id)!, mode);
    const items = [...receivables, ...(payablesQ.data ?? [])]
      .filter((i) => ids.has(i.company_id))
      .map((i) => ({ ...i, amount: sh(i.amount, i.company_id) }));
    const fixedCosts = (fixedQ.data ?? [])
      .filter((f) => ids.has(f.company_id))
      .map((f) => ({ ...f, monthly_amount: sh(f.monthly_amount, f.company_id) }));
    const startBalance = (bankQ.data ?? []).filter((b) => ids.has(b.company_id)).reduce((s, b) => s + sh(b.balance, b.company_id), 0);
    const buffer = visible.reduce((s, c) => s + applyShare(c.min_buffer, c, mode), 0);
    const weeks = forecast13Weeks({ startBalance, items, fixedCosts, today });
    const chart = weeks.map((w) => ({ label: `wk ${getISOWeek(parseISO(w.weekStart))}`, balance: Math.round(w.balance), buffer: Math.round(buffer) }));
    const synced = visible.map((c) => c.last_synced_at);
    const oldestSync = synced.length > 0 && synced.every(Boolean) ? (synced as string[]).sort()[0] : null;
    return { all, rows, group, chart, minBalance: Math.min(...weeks.map((w) => w.balance)), oldestSync };
  }, [companiesQ.data, monthlyQ.data, bankQ.data, receivablesQ.data, payablesQ.data, targetsQ.data, fixedQ.data, companyId, month, mode]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const { all, rows, group, chart, minBalance, oldestSync } = data;
  const monthName = format(parseISO(month), 'LLLL', { locale: nl });
  const th = 'py-1 font-medium text-muted-foreground';

  return (
    <div className="p-6 print:p-0">
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Bedrijf</span>
          <select aria-label="Bedrijf" className={selectClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="all">Groep (alle bedrijven)</option>
            {all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">Maand</span>
          <input aria-label="Maand" type="month" className={selectClass} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        </label>
        <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />Download PDF</Button>
      </div>

      <article id="finance-report" className="mx-auto w-[210mm] max-w-full space-y-5 rounded-lg border bg-white p-[12mm] text-sm text-black shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b pb-3">
          <div>
            <h1 className="text-xl font-semibold">OneGroup — Financieel overzicht {monthName} {year}</h1>
            <p className="text-xs text-gray-500">
              {companyId === 'all' ? 'Groep, excl. intercompany' : rows[0]?.name} · {mode === 'share' ? 'aandeel OneGroup' : '100%'} · {format(new Date(), 'd MMMM yyyy', { locale: nl })}
            </p>
          </div>
          <FreshnessBadge syncedAt={oldestSync} />
        </header>

        <section>
          <h2 className="mb-1 font-semibold">Banksaldi</h2>
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.companyId} className="border-b"><td className="py-1">{r.name}</td><td className="py-1 text-right tabular-nums">{eur(r.bank)}</td></tr>
              ))}
              <tr data-testid="bank-totaal" className="font-semibold"><td className="py-1">Totaal</td><td className="py-1 text-right tabular-nums">{eur(group.bank)}</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Omzet {monthName} vs target</h2>
          <table className="w-full">
            <thead><tr className="border-b text-left"><th className={th}>Bedrijf</th><th className={`${th} text-right`}>Omzet</th><th className={`${th} text-right`}>Target</th><th className={`${th} text-right`}>Behaald</th></tr></thead>
            <tbody>
              {[...rows.map((r) => ({ key: r.companyId, name: r.name, revenue: r.revenueMonth, target: r.targetMonth, pct: r.targetPct })),
                { key: 'totaal', name: 'Totaal', revenue: group.revenueMonth, target: group.targetMonth, pct: group.targetPct }].map((r) => (
                <tr key={r.key} className={r.key === 'totaal' ? 'font-semibold' : 'border-b'}>
                  <td className="py-1">{r.name}</td>
                  <td className="py-1 text-right tabular-nums">{eur(r.revenue)}</td>
                  <td className="py-1 text-right tabular-nums">{eur(r.target)}</td>
                  <td className="py-1 text-right tabular-nums">{r.pct === null ? '—' : `${Math.round(r.pct * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-gray-500">Omzet YTD {eur(group.revenueYtd)} · Resultaat YTD {eur(group.resultYtd)}</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Prognose 13 weken</h2>
          <LineChart width={640} height={170} data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
            <Line type="monotone" dataKey="balance" stroke="#14a38b" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="buffer" stroke="#b5452f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
          <p className="text-xs text-gray-500">Laagste verwachte saldo: {eur(minBalance)} · rode lijn = minimumbuffer</p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Open debiteuren</h2>
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.companyId} className="border-b">
                  <td className="py-1">{r.name}</td>
                  <td className="py-1 text-right tabular-nums">{eur(r.receivables)}{r.overdue > 0 && ` · ${eur(r.overdue)} te laat`}</td>
                </tr>
              ))}
              <tr data-testid="deb-totaal" className="font-semibold">
                <td className="py-1">Totaal</td>
                <td className="py-1 text-right tabular-nums"><span>{eur(group.receivables)}</span> · <span>{eur(group.overdue)} te laat</span></td>
              </tr>
            </tbody>
          </table>
        </section>
      </article>
    </div>
  );
}
