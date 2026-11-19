import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useFinanceCompanies, useFinanceOpenItems } from '@/hooks/useFinance';
import { Section } from '@/components/finance/Section';
import { Segmented } from '@/components/finance/Segmented';
import { eur } from '@/lib/finance/format';
import { CHIP_WARNING_LIGHT, TABLE, TONE_CHIP, TONE_TEXT } from '@/lib/finance/ui';
import { cn } from '@/lib/utils';
import { useFinanceFilter } from './FinanceFilter';

export default function DebiteurenPage() {
  const { companyId } = useFinanceFilter();
  const companiesQ = useFinanceCompanies();
  const itemsQ = useFinanceOpenItems('receivable');
  const [filterMode, setFilterMode] = useState<'all' | 'late'>('all');
  const onlyLate = filterMode === 'late';

  const all = useMemo(() => {
    // R3: alleen niet-uitgesloten bedrijven, daarna het gekozen bedrijf.
    const names = new Map(
      (companiesQ.data ?? []).filter((c) => !c.excluded && (companyId === 'all' || c.id === companyId)).map((c) => [c.id, c.name]),
    );
    const today = new Date();
    return (itemsQ.data ?? [])
      .filter((i) => names.has(i.company_id))
      .map((i) => ({
        item: i,
        company: names.get(i.company_id)!,
        late: i.due_date ? Math.max(0, differenceInCalendarDays(today, parseISO(i.due_date))) : null,
      }))
      .sort((a, b) => (b.late ?? -1) - (a.late ?? -1));
  }, [companiesQ.data, itemsQ.data, companyId]);
  const rows = useMemo(() => all.filter((r) => !onlyLate || (r.late ?? 0) > 0), [all, onlyLate]);

  if (companiesQ.isLoading || itemsQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const overdueRows = all.filter((r) => (r.late ?? 0) > 0);
  const totalOpen = all.reduce((sum, r) => sum + r.item.amount, 0);
  const totalOverdue = overdueRows.reduce((sum, r) => sum + r.item.amount, 0);
  const oldest = overdueRows[0]?.late ?? null;

  return (
    <div className="space-y-6 p-6">
      <Section
        title="Open facturen"
        description="Dit zijn echte facturen: bedragen zijn altijd 100%, ook in aandeel-modus."
        actions={
          <Segmented<'all' | 'late'>
            label="Filter facturen"
            value={filterMode}
            onChange={setFilterMode}
            options={[{ value: 'all', label: 'Alles' }, { value: 'late', label: 'Te laat' }]}
          />
        }
        flush
      >
        <dl className="grid grid-cols-2 divide-x border-b sm:grid-cols-4">
          <Stat label="Totaal open" value={eur(totalOpen)} />
          <Stat label="Te laat" value={eur(totalOverdue)} className={totalOverdue > 0 ? TONE_TEXT.danger : undefined} />
          <Stat label="Aantal te laat" value={String(overdueRows.length)} />
          <Stat label="Oudste" value={oldest === null ? '—' : `${oldest} dagen`} />
        </dl>
        <table className={TABLE.table}>
          <thead>
            <tr className={TABLE.headRow}>
              <th className={TABLE.th}>Bedrijf</th><th className={TABLE.th}>Factuur</th><th className={TABLE.th}>Klant</th>
              <th className={TABLE.thNum}>Bedrag</th><th className={TABLE.th}>Vervaldatum</th>
              <th className={TABLE.thNum}>Dagen te laat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, company, late }) => (
              <tr key={item.id} data-testid={`factuur-${item.id}`} className={TABLE.row}>
                <td className={cn(TABLE.td, 'text-muted-foreground')}>{company}</td>
                <td className={cn(TABLE.td, 'tabular-nums')}>{item.invoice_number ?? '—'}</td>
                <td className={cn(TABLE.td, 'font-medium')}>{item.counterparty}</td>
                <td className={cn(TABLE.tdNum, 'font-semibold')}>{eur(item.amount)}</td>
                <td className={cn(TABLE.td, 'whitespace-nowrap text-muted-foreground')}>{item.due_date ? format(parseISO(item.due_date), 'd MMM yyyy', { locale: nl }) : '—'}</td>
                <td className={TABLE.tdNum}><AgingChip late={late} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Geen facturen.</td></tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-[15px] font-semibold tabular-nums', className)}>{value}</dd>
    </div>
  );
}

/** Ouderdom: nog niet vervallen (grijs), 1–30 licht oranje, 31–60 oranje, > 60 rood. */
function AgingChip({ late }: { late: number | null }) {
  if (late === null) return <span className="text-muted-foreground">—</span>;
  if (late === 0) return <span className={cn('inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium', TONE_CHIP.muted)}>nog niet vervallen</span>;
  const cls = late > 60 ? TONE_CHIP.danger : late > 30 ? TONE_CHIP.warning : CHIP_WARNING_LIGHT;
  return <span className={cn('inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums', cls)}>{late}</span>;
}
