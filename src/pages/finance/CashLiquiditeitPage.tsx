import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, getISOWeek, parseISO } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FixedCostDialog, FIXED_COST_CATEGORIES } from '@/components/finance/FixedCostDialog';
import { Section } from '@/components/finance/Section';
import { StatusDot } from '@/components/finance/StatusDot';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useFinanceBank, useFinanceCompanies, useFinanceFixedCosts, useFinanceMe, useFinanceOpenItems, useFinanceSupplierSpend,
} from '@/hooks/useFinance';
import { applyShare } from '@/lib/finance/aggregate';
import { forecast13Weeks } from '@/lib/finance/forecast';
import { eur } from '@/lib/finance/format';
import { eurK, TABLE, TONE_HEX, TONE_TEXT } from '@/lib/finance/ui';
import { cn } from '@/lib/utils';
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
    // Banktabel gegroepeerd per bedrijf, in de volgorde van de bedrijvenlijst.
    const bankGroups = visible
      .map((c) => {
        const accounts = bank.filter((b) => b.company_id === c.id);
        return { company: c, accounts, subtotal: accounts.reduce((s, b) => s + applyShare(b.balance, c, mode), 0) };
      })
      .filter((g) => g.accounts.length > 0);
    return { visible, bankGroups, bankTotal, buffer, chart, fixedRows, fixedTotal, runway, today };
  }, [companiesQ.data, bankQ.data, receivablesQ.data, payablesQ.data, fixedQ.data, spendQ.data, companyId, mode]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const { visible, bankGroups, bankTotal, buffer, chart, fixedRows, fixedTotal, runway, today } = view;
  const catLabel = (v: string) => FIXED_COST_CATEGORIES.find((c) => c.value === v)?.label ?? v;
  const last = chart[chart.length - 1];
  const RUNWAY_SCALE = 24; // maanden: volle meter
  const runwayTone = runway === null ? 'muted' : runway < 3 ? 'danger' : runway < 6 ? 'warning' : 'success';

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Prognose banksaldo, 13 weken"
          description={last
            ? <span className="tabular-nums">nu <span className="font-medium text-foreground">{eurK(bankTotal)}</span> → week 13 <span className={cn('font-medium', last.balance < buffer ? TONE_TEXT.danger : 'text-foreground')}>{eurK(last.balance)}</span></span>
            : undefined}
        >
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <Area type="monotone" dataKey="balance" name="Banksaldo" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.1} dot={false} isAnimationActive={false} />
                {buffer > 0 && (
                  <ReferenceLine
                    y={buffer}
                    stroke={TONE_HEX.danger}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'buffer', position: 'insideTopRight', fontSize: 11, fill: TONE_HEX.danger }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Collapsible className="mt-3">
            <CollapsibleTrigger className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
              Hoe wordt dit berekend?
            </CollapsibleTrigger>
            <CollapsibleContent forceMount className="data-[state=closed]:hidden">
              <ul className="mt-2 space-y-1 rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                <li>= banksaldo nu</li>
                <li>+ open debiteuren op hun vervaldatum. Te late debiteuren tellen mee in week 1.</li>
                <li>− open crediteuren op hun vervaldatum</li>
                <li>− vaste lasten en abonnementen per maand</li>
                <li>rode stippellijn = minimumbuffer, opgeteld over de bedrijven</li>
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </Section>

        <Section
          title="Banksaldo per bedrijf"
          description={`Afschrift ouder dan ${STALE_STATEMENT_DAYS} dagen is rood gemarkeerd.`}
          actions={<span className="text-[15px] font-semibold tabular-nums">{eur(bankTotal)}</span>}
          flush
        >
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.headRow}>
                <th className={TABLE.th}>Bedrijf / rekening</th>
                <th className={TABLE.thNum}>Saldo</th>
                <th className={TABLE.th}>Laatste afschrift</th>
              </tr>
            </thead>
            <tbody>
              {bankGroups.map(({ company: c, accounts, subtotal }) => {
                const multi = accounts.length > 1;
                return [
                  multi && (
                    <tr key={`${c.id}-head`} className="h-10 border-b bg-muted/30">
                      <td className={cn(TABLE.td, 'font-medium')}>{c.name}</td>
                      <td className={cn(TABLE.tdNum, 'font-semibold')}>{eur(subtotal)}</td>
                      <td className={TABLE.td} />
                    </tr>
                  ),
                  ...accounts.map((b) => {
                    const st = statementLabel(b.last_statement_date, today);
                    return (
                      <tr key={b.id} className={TABLE.row}>
                        <td className={TABLE.td}>
                          {multi
                            ? <span className="pl-3 text-muted-foreground">{b.name}</span>
                            : <><span className="font-medium">{c.name}</span><span className="ml-2 text-muted-foreground">{b.name}</span></>}
                        </td>
                        <td className={cn(TABLE.tdNum, !multi && 'font-semibold')}>{eur(applyShare(b.balance, c, mode))}</td>
                        <td data-testid={`afschrift-${b.id}`} className={cn(TABLE.td, st.stale ? TONE_TEXT.danger : 'text-muted-foreground')}>
                          {b.last_statement_date
                            ? <StatusDot tone={st.stale ? 'danger' : 'success'}>{st.text}</StatusDot>
                            : st.text}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Section
          title="Abonnementen & vaste lasten"
          description="Echt betaald = laatste inkoopfactuur van die leverancier in Exact. Afwijking boven 5% is gemarkeerd."
          actions={canManage && <Button size="sm" className="h-9 rounded-md shadow-none" onClick={() => setDialogOpen(true)}>+ Nieuwe maandlast</Button>}
          flush
        >
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.headRow}>
                <th className={TABLE.th}>Wat</th><th className={TABLE.th}>Bedrijf</th><th className={TABLE.th}>Categorie</th>
                <th className={TABLE.thNum}>p/m</th><th className={TABLE.thNum}>Echt betaald</th>
              </tr>
            </thead>
            <tbody>
              {fixedRows.map(({ f, paid, deviates, company }) => {
                const diff = paid !== null ? paid - f.monthly_amount : 0;
                return (
                  <tr key={f.id} data-testid={`vast-${f.id}`} data-afwijking={String(deviates)} className={TABLE.row}>
                    <td className={cn(TABLE.td, 'font-medium')}>{f.name}</td>
                    <td className={cn(TABLE.td, 'text-muted-foreground')}>{company}</td>
                    <td className={TABLE.td}>
                      <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{catLabel(f.category)}</span>
                    </td>
                    <td className={TABLE.tdNum}>{eur(f.monthly_amount)}</td>
                    <td className={TABLE.tdNum}>
                      {paid === null
                        ? <span className="text-muted-foreground">nog niet</span>
                        : <span className="inline-flex items-baseline gap-2">
                            {deviates && (
                              <span className={cn('text-xs font-medium', diff > 0 ? TONE_TEXT.danger : TONE_TEXT.warning)}>
                                {diff > 0 ? '▲' : '▼'} {eur(Math.abs(diff))}
                              </span>
                            )}
                            <span>{eur(paid)}</span>
                          </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title="Totaal vaste lasten" description="per maand, actieve posten">
          <div data-testid="totaal-vast" className="text-[28px] font-semibold leading-9 tracking-tight tabular-nums">{eur(fixedTotal)}</div>
          <div className="mt-5 border-t pt-4">
            <div data-testid="runway" className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-muted-foreground">Runway zonder nieuwe omzet:</span>
              <span className="font-semibold tabular-nums">{runway === null ? '—' : `${runway} maanden`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-md bg-muted" aria-hidden>
              <div
                className="h-full rounded-md"
                style={{ width: `${runway === null ? 0 : Math.min(100, (runway / RUNWAY_SCALE) * 100)}%`, background: TONE_HEX[runwayTone] }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>0</span><span>6</span><span>12</span><span>18</span><span>{RUNWAY_SCALE}+ mnd</span>
            </div>
          </div>
        </Section>
      </div>

      {canManage && <FixedCostDialog open={dialogOpen} onOpenChange={setDialogOpen} companies={visible.map((c) => ({ id: c.id, name: c.name }))} />}
    </div>
  );
}
