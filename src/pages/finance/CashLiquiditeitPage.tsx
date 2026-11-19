import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, getISOWeek, parseISO } from 'date-fns';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FixedCostDialog, FIXED_COST_CATEGORIES } from '@/components/finance/FixedCostDialog';
import { Button } from '@/components/ui/button';
import {
  useFinanceBank, useFinanceCompanies, useFinanceFixedCosts, useFinanceMe, useFinanceOpenItems, useFinanceSupplierSpend,
} from '@/hooks/useFinance';
import { applyShare } from '@/lib/finance/aggregate';
import { forecast13Weeks } from '@/lib/finance/forecast';
import { eur } from '@/lib/finance/format';
import { useFinanceFilter } from './FinanceFilter';

const STALE_STATEMENT_DAYS = 7;
const DEVIATION = 0.05;

function statementLabel(date: string | null, today: Date): { text: string; stale: boolean } {
  if (!date) return { text: '—', stale: false };
  const days = differenceInCalendarDays(today, parseISO(date));
  const text = days <= 0 ? 'vandaag' : days === 1 ? 'gisteren' : `${days} dagen geleden`;
  return { text, stale: days > STALE_STATEMENT_DAYS };
}

export default function CashLiquiditeitPage() {
  const { companyId, mode } = useFinanceFilter();
  const meQ = useFinanceMe();
  const companiesQ = useFinanceCompanies();
  const bankQ = useFinanceBank();
  const receivablesQ = useFinanceOpenItems('receivable');
  const payablesQ = useFinanceOpenItems('payable');
  const fixedQ = useFinanceFixedCosts();
  const spendQ = useFinanceSupplierSpend();
  const [dialogOpen, setDialogOpen] = useState(false);

  const canManage = meQ.data?.level === 'manage' || meQ.data?.is_super_admin === true;
  const loading = [companiesQ, bankQ, receivablesQ, payablesQ, fixedQ, spendQ].some((q) => q.isLoading);

  const view = useMemo(() => {
    // R3: alleen niet-uitgesloten bedrijven, daarna het gekozen bedrijf.
    const visible = (companiesQ.data ?? []).filter((c) => !c.excluded && (companyId === 'all' || c.id === companyId));
    const byId = new Map(visible.map((c) => [c.id, c]));
    const sh = (n: number, id: string) => applyShare(n, byId.get(id)!, mode);

    const bank = (bankQ.data ?? []).filter((b) => byId.has(b.company_id));
    const bankTotal = bank.reduce((s, b) => s + sh(b.balance, b.company_id), 0);
    const items = [...(receivablesQ.data ?? []), ...(payablesQ.data ?? [])]
      .filter((i) => byId.has(i.company_id))
      .map((i) => ({ ...i, amount: sh(i.amount, i.company_id) }));
    const fixed = (fixedQ.data ?? [])
      .filter((f) => byId.has(f.company_id))
      .map((f) => ({ ...f, monthly_amount: sh(f.monthly_amount, f.company_id) }));
    const buffer = visible.reduce((s, c) => s + applyShare(c.min_buffer, c, mode), 0);

    const today = new Date();
    const weeks = forecast13Weeks({ startBalance: bankTotal, items, fixedCosts: fixed, today: format(today, 'yyyy-MM-dd') });
    const chart = weeks.map((w) => ({
      label: `wk ${getISOWeek(parseISO(w.weekStart))}`, balance: Math.round(w.balance), buffer: Math.round(buffer),
    }));
    const spend = new Map((spendQ.data ?? []).map((s) => [`${s.company_id}|${s.supplier_code}`, s]));
    const fixedRows = fixed.map((f) => {
      const s = f.exact_supplier_code ? spend.get(`${f.company_id}|${f.exact_supplier_code}`) : undefined;
      const paid = s?.last_amount != null ? sh(s.last_amount, f.company_id) : null;
      const deviates = paid !== null && f.monthly_amount > 0 ? Math.abs(paid - f.monthly_amount) / f.monthly_amount > DEVIATION : paid !== null && paid !== f.monthly_amount;
      return { f, paid, deviates, company: byId.get(f.company_id)!.name };
    });
    const fixedTotal = fixed.filter((f) => f.active).reduce((s, f) => s + f.monthly_amount, 0);
    const runway = fixedTotal > 0 ? Math.floor(bankTotal / fixedTotal) : null;
    return { visible, bank, bankTotal, chart, fixedRows, fixedTotal, runway, today, byId };
  }, [companiesQ.data, bankQ.data, receivablesQ.data, payablesQ.data, fixedQ.data, spendQ.data, companyId, mode]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const { visible, bank, chart, fixedRows, fixedTotal, runway, today, byId } = view;
  const catLabel = (v: string) => FIXED_COST_CATEGORIES.find((c) => c.value === v)?.label ?? v;
  const th = 'px-3 py-2 font-medium text-muted-foreground';

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">Prognose banksaldo, 13 weken</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <Legend />
                <Line type="monotone" dataKey="balance" name="Banksaldo" stroke="#14a38b" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="buffer" name="Minimumbuffer" stroke="#b5452f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>= banksaldo nu</li>
            <li>+ open debiteuren op hun vervaldatum. Te late debiteuren tellen mee in week 1.</li>
            <li>− open crediteuren op hun vervaldatum</li>
            <li>− vaste lasten en abonnementen per maand</li>
            <li>rode streep = minimumbuffer per bedrijf</li>
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium">Banksaldo per bedrijf</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className={th}>Bedrijf</th><th className={th}>Rekening</th>
                <th className={`${th} text-right`}>Saldo</th><th className={th}>Laatste afschrift</th>
              </tr>
            </thead>
            <tbody>
              {bank.map((b) => {
                const st = statementLabel(b.last_statement_date, today);
                const c = byId.get(b.company_id)!;
                return (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2">{b.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(applyShare(b.balance, c, mode))}</td>
                    <td data-testid={`afschrift-${b.id}`} className={`px-3 py-2 ${st.stale ? 'text-rose-600 dark:text-rose-300' : ''}`}>{st.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Laatste afschrift wordt rood als het saldo ouder is dan {STALE_STATEMENT_DAYS} dagen.</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Abonnementen &amp; vaste lasten</h3>
            {canManage && <Button size="sm" onClick={() => setDialogOpen(true)}>+ Nieuwe maandlast</Button>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className={th}>Wat</th><th className={th}>Bedrijf</th><th className={th}>Categorie</th>
                <th className={`${th} text-right`}>p/m</th><th className={`${th} text-right`}>Echt betaald*</th>
              </tr>
            </thead>
            <tbody>
              {fixedRows.map(({ f, paid, deviates, company }) => (
                <tr key={f.id} data-testid={`vast-${f.id}`} data-afwijking={String(deviates)} className="border-b last:border-0">
                  <td className="px-3 py-2">{f.name}</td>
                  <td className="px-3 py-2">{company}</td>
                  <td className="px-3 py-2">{catLabel(f.category)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eur(f.monthly_amount)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${deviates ? 'font-medium text-amber-600 dark:text-amber-300' : ''}`}>
                    {paid === null ? 'nog niet' : eur(paid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">* uit Exact: de laatste inkoopfactuur van die leverancier. Wijkt meer dan 5% af = oranje.</p>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium">Totaal vaste lasten</h3>
          <div data-testid="totaal-vast" className="mt-1 text-2xl font-semibold tabular-nums">{eur(fixedTotal)}</div>
          <div className="text-xs text-muted-foreground">per maand</div>
          <div data-testid="runway" className="mt-3 text-sm">
            Runway zonder nieuwe omzet: {runway === null ? '—' : `${runway} maanden`}
          </div>
        </section>
      </div>

      {canManage && <FixedCostDialog open={dialogOpen} onOpenChange={setDialogOpen} companies={visible.map((c) => ({ id: c.id, name: c.name }))} />}
    </div>
  );
}
