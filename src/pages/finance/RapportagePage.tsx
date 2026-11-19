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
import { pct, targetColor, TONE_HEX } from '@/lib/finance/ui';
import { useFinanceFilter } from './FinanceFilter';

const selectClass = 'h-9 rounded-md border border-input bg-background px-2.5 text-[13px]';

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
  // Het rapport is altijd een wit A4-vel, ook in dark mode: vaste grijstinten in plaats van thematokens.
  const th = 'py-1.5 text-[11px] font-medium text-gray-500';
  const td = 'py-1.5';
  const num = 'py-1.5 text-right tabular-nums';
  const totalRow = 'border-t border-gray-300 font-semibold';
  const row = 'border-b border-gray-100';

  return (
    <div className="p-6 print:p-0">
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <select aria-label="Bedrijf" className={selectClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="all">Groep (alle bedrijven)</option>
          {all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input aria-label="Maand" type="month" className={selectClass} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        <Button size="sm" className="h-9 rounded-md shadow-none sm:ml-auto" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />Download PDF</Button>
      </div>

      <article id="finance-report" className="mx-auto w-[210mm] max-w-full space-y-7 rounded-xl border bg-white p-[14mm] text-[13px] text-gray-900 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">OneGroup — Financieel overzicht {monthName} {year}</h1>
            <p className="mt-1 text-xs text-gray-500">
              {companyId === 'all' ? 'Groep, excl. intercompany' : rows[0]?.name} · {mode === 'share' ? 'aandeel OneGroup' : '100%'} · {format(new Date(), 'd MMMM yyyy', { locale: nl })}
            </p>
          </div>
          <FreshnessBadge syncedAt={oldestSync} className="mt-1 text-xs text-gray-500" />
        </header>

        <section>
          <ReportHeading>Banksaldi</ReportHeading>
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.companyId} className={row}><td className={td}>{r.name}</td><td className={num}>{eur(r.bank)}</td></tr>
              ))}
              <tr data-testid="bank-totaal" className={totalRow}><td className={td}>Totaal</td><td className={num}>{eur(group.bank)}</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <ReportHeading>Omzet {monthName} vs target</ReportHeading>
          <table className="w-full">
            <thead><tr className="border-b border-gray-200 text-left"><th className={th}>Bedrijf</th><th className={`${th} text-right`}>Omzet</th><th className={`${th} text-right`}>Target</th><th className={`${th} text-right`}>Behaald</th></tr></thead>
            <tbody>
              {[...rows.map((r) => ({ key: r.companyId, name: r.name, revenue: r.revenueMonth, target: r.targetMonth, pct: r.targetPct })),
                { key: 'totaal', name: 'Totaal', revenue: group.revenueMonth, target: group.targetMonth, pct: group.targetPct }].map((r) => (
                <tr key={r.key} className={r.key === 'totaal' ? totalRow : row}>
                  <td className={td}>{r.name}</td>
                  <td className={num}>{eur(r.revenue)}</td>
                  <td className={num}>{eur(r.target)}</td>
                  {/* Lichtgroen (bijna) is als tekst op wit te zwak: dan het donkere groen. */}
                  <td className={`${num} font-semibold`} style={r.pct === null ? undefined : { color: r.pct >= 0.85 && r.pct < 1 ? TONE_HEX.success : targetColor(r.pct) }}>
                    {r.pct === null ? '—' : pct(r.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">Omzet YTD <span className="font-medium tabular-nums text-gray-700">{eur(group.revenueYtd)}</span> · Resultaat YTD <span className="font-medium tabular-nums text-gray-700">{eur(group.resultYtd)}</span></p>
        </section>

        <section>
          <ReportHeading>Prognose 13 weken</ReportHeading>
          <LineChart width={640} height={170} data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
            <Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="buffer" stroke={TONE_HEX.danger} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          </LineChart>
          <p className="mt-1 text-xs text-gray-500">Laagste verwachte saldo: <span className="font-medium tabular-nums text-gray-700">{eur(minBalance)}</span> · rode stippellijn = minimumbuffer</p>
        </section>

        <section>
          <ReportHeading>Open debiteuren</ReportHeading>
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.companyId} className={row}>
                  <td className={td}>{r.name}</td>
                  <td className={num}>
                    {eur(r.receivables)}
                    {r.overdue > 0 && <span className="ml-2 text-xs" style={{ color: TONE_HEX.danger }}>{eur(r.overdue)} te laat</span>}
                  </td>
                </tr>
              ))}
              <tr data-testid="deb-totaal" className={totalRow}>
                <td className={td}>Totaal</td>
                <td className={num}><span>{eur(group.receivables)}</span> · <span style={group.overdue > 0 ? { color: TONE_HEX.danger } : undefined}>{eur(group.overdue)} te laat</span></td>
              </tr>
            </tbody>
          </table>
        </section>
      </article>
    </div>
  );
}

function ReportHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 border-b border-gray-200 pb-1.5 text-[13px] font-semibold">{children}</h2>;
}
