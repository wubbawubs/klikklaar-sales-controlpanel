import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useFinanceCompanies, useFinanceOpenItems } from '@/hooks/useFinance';
import { eur } from '@/lib/finance/format';
import { useFinanceFilter } from './FinanceFilter';

export default function DebiteurenPage() {
  const { companyId } = useFinanceFilter();
  const companiesQ = useFinanceCompanies();
  const itemsQ = useFinanceOpenItems('receivable');
  const [onlyLate, setOnlyLate] = useState(false);

  const rows = useMemo(() => {
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
      .filter((r) => !onlyLate || (r.late ?? 0) > 0)
      .sort((a, b) => (b.late ?? -1) - (a.late ?? -1));
  }, [companiesQ.data, itemsQ.data, companyId, onlyLate]);

  if (companiesQ.isLoading || itemsQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;

  const th = 'px-3 py-2 font-medium text-muted-foreground';
  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />
          Alleen te laat
        </label>
        <p className="text-xs text-muted-foreground">Dit zijn echte facturen: bedragen zijn altijd 100%, ook in aandeel-modus.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className={th}>Bedrijf</th><th className={th}>Factuur</th><th className={th}>Klant</th>
              <th className={`${th} text-right`}>Bedrag</th><th className={th}>Vervaldatum</th>
              <th className={`${th} text-right`}>Dagen te laat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, company, late }) => (
              <tr key={item.id} data-testid={`factuur-${item.id}`} className="border-b last:border-0">
                <td className="px-3 py-2">{company}</td>
                <td className="px-3 py-2">{item.invoice_number ?? '—'}</td>
                <td className="px-3 py-2">{item.counterparty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{eur(item.amount)}</td>
                <td className="px-3 py-2">{item.due_date ? format(parseISO(item.due_date), 'd MMM yyyy', { locale: nl }) : '—'}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${late ? 'text-rose-600 dark:text-rose-300' : ''}`}>
                  {late === null ? '—' : late}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Geen facturen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
