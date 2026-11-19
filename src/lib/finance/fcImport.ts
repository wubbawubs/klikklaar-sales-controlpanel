// Eenmalige overname uit de oude finance-control-app. Alleen SQL genereren; geen databaseverbinding.
// Bewust zonder imports: het script scripts/finance-control-import.mjs laadt dit bestand rechtstreeks (Node type stripping).

export interface FcCompany {
  id: string;
  name: string;
  legal_name: string | null;
  ownership_percentage: number;
}
export interface FcTarget {
  company_id: string;
  month: string;
  target_revenue: number;
}
export interface FcExpense {
  company_id: string;
  name: string;
  category: string;
  amount: number;
  month: string | null;
  recurring: boolean;
  active: boolean;
  notes: string | null;
}

const CATEGORIES = ['personeel', 'huisvesting', 'software', 'marketing', 'verzekeringen', 'advies', 'overig'];

const str = (s: string) => `'${s.replace(/'/g, "''")}'`;
const comment = (s: string) => s.replace(/[\r\n]+/g, ' ');
const num = (n: unknown): number | null => {
  const v = typeof n === 'string' ? Number(n) : (n as number);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const category = (c: string) => {
  const k = (c ?? '').trim().toLowerCase();
  return CATEGORIES.includes(k) ? k : 'overig';
};
const monthStart = (m: string) => `${m.slice(0, 7)}-01`;

export function buildImportSql(input: {
  companies: FcCompany[];
  targets: FcTarget[];
  expenses: FcExpense[];
  mapping: Record<string, number>;
}): string {
  const { companies, targets, expenses, mapping } = input;
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const division = (fcId: string): number | undefined => mapping[fcId];
  const out: string[] = ['BEGIN;', ''];

  out.push('-- Bedrijven (upsert op exact_division; alleen ownership_pct wordt bij bestaande rijen bijgewerkt)');
  for (const c of companies) {
    const d = division(c.id);
    const pct = num(c.ownership_percentage);
    if (d === undefined) {
      out.push(`-- NIET GEKOPPELD: ${comment(c.name)} (${comment(c.id)})`);
      continue;
    }
    if (pct === null) {
      out.push(`-- OVERGESLAGEN (ongeldig aandeel): ${comment(c.name)}`);
      continue;
    }
    out.push(
      `INSERT INTO public.finance_companies (exact_division, name, legal_name, ownership_pct) VALUES (${d}, ${str(c.name)}, ${c.legal_name ? str(c.legal_name) : 'NULL'}, ${pct}) ` +
        'ON CONFLICT (exact_division) DO UPDATE SET ownership_pct = EXCLUDED.ownership_pct;',
    );
  }

  out.push('', '-- Targets');
  for (const t of targets) {
    const d = division(t.company_id);
    if (d === undefined) {
      out.push(`-- NIET GEKOPPELD (target): ${comment(names.get(t.company_id) ?? t.company_id)} ${comment(String(t.month))}`);
      continue;
    }
    const v = num(t.target_revenue);
    if (v === null || v < 0 || !t.month) {
      out.push(`-- OVERGESLAGEN (ongeldig target): ${comment(names.get(t.company_id) ?? t.company_id)} ${comment(String(t.month))}`);
      continue;
    }
    out.push(
      `INSERT INTO public.finance_targets (company_id, month, target) SELECT id, ${str(monthStart(t.month))}, ${v} FROM public.finance_companies WHERE exact_division = ${d} ` +
        'ON CONFLICT (company_id, month) DO UPDATE SET target = EXCLUDED.target;',
    );
  }

  out.push('', '-- Vaste lasten (alleen recurring en actief). created_by blijft NULL; de melding-trigger staat hieromheen uit.');
  out.push('ALTER TABLE public.finance_fixed_costs DISABLE TRIGGER finance_fixed_costs_notify;');
  for (const e of expenses) {
    if (!(e.recurring && e.active)) continue;
    const d = division(e.company_id);
    if (d === undefined) {
      out.push(`-- NIET GEKOPPELD (vaste last): ${comment(names.get(e.company_id) ?? e.company_id)} / ${comment(e.name)}`);
      continue;
    }
    const amount = num(e.amount);
    if (amount === null || amount < 0) {
      out.push(`-- OVERGESLAGEN (ongeldig bedrag): ${comment(e.name)}`);
      continue;
    }
    const cat = category(e.category);
    out.push(
      'INSERT INTO public.finance_fixed_costs (company_id, name, category, monthly_amount, active, created_by) ' +
        `SELECT fc.id, ${str(e.name)}, ${str(cat)}, ${amount}, true, NULL FROM public.finance_companies fc WHERE fc.exact_division = ${d} ` +
        `AND NOT EXISTS (SELECT 1 FROM public.finance_fixed_costs x WHERE x.company_id = fc.id AND x.name = ${str(e.name)} AND x.monthly_amount = ${amount});`,
    );
  }
  out.push('ALTER TABLE public.finance_fixed_costs ENABLE TRIGGER finance_fixed_costs_notify;');

  out.push('', 'COMMIT;', '');
  return out.join('\n');
}
