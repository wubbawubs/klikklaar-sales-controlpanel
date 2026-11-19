import { describe, it, expect } from 'vitest';
import { buildImportSql, type FcCompany, type FcExpense, type FcTarget } from './fcImport';

const companies: FcCompany[] = [
  { id: 'c1', name: "O'Reilly Media", legal_name: "O'Reilly B.V.", ownership_percentage: 60 },
  { id: 'c2', name: 'Los', legal_name: null, ownership_percentage: 100 },
];
const targets: FcTarget[] = [
  { company_id: 'c1', month: '2026-03-01', target_revenue: 12000 },
  { company_id: 'c2', month: '2026-03-01', target_revenue: 500 },
];
const exp = (o: Partial<FcExpense>): FcExpense => ({
  company_id: 'c1', name: 'HubSpot', category: 'software', amount: 450, month: null, recurring: true, active: true, notes: null, ...o,
});
const expenses: FcExpense[] = [
  exp({}),
  exp({ name: 'Eenmalig', recurring: false }),
  exp({ name: 'Inactief', active: false }),
  exp({ name: 'Vreemd', category: 'iets-anders', amount: 10 }),
  exp({ name: 'Van los', company_id: 'c2' }),
];
const sql = buildImportSql({ companies, targets, expenses, mapping: { c1: 101 } });

describe('buildImportSql', () => {
  it('zit in een BEGIN/COMMIT', () => {
    expect(sql.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql.match(/^BEGIN;/gm)).toHaveLength(1);
  });

  it('upsert bedrijven op exact_division met ownership_pct en escaped strings', () => {
    expect(sql).toContain("'O''Reilly Media'");
    expect(sql).toContain("'O''Reilly B.V.'");
    expect(sql).toMatch(/INSERT INTO public\.finance_companies[\s\S]*101[\s\S]*60/);
    expect(sql).toContain('ON CONFLICT (exact_division) DO UPDATE SET ownership_pct = EXCLUDED.ownership_pct');
  });

  it('ongekoppeld bedrijf: alleen commentaar, geen SQL voor bedrijf, target of lasten', () => {
    expect(sql).toContain('-- NIET GEKOPPELD: Los (c2)');
    const code = sql.split('\n').filter((l) => !l.startsWith('--')).join('\n');
    expect(code).not.toContain("'Los'");
    expect(code).not.toContain('Van los');
    expect(code).not.toContain('500');
  });

  it('targets naar finance_targets', () => {
    expect(sql).toMatch(/INSERT INTO public\.finance_targets[\s\S]*'2026-03-01'[\s\S]*12000/);
    expect(sql).toContain('ON CONFLICT (company_id, month) DO UPDATE SET target = EXCLUDED.target');
  });

  it('alleen recurring en active expenses, categorie-mapping met fallback overig, created_by NULL', () => {
    expect(sql).toContain("'HubSpot'");
    expect(sql).not.toContain('Eenmalig');
    expect(sql).not.toContain('Inactief');
    expect(sql).toMatch(/'Vreemd', 'overig', 10/);
    expect(sql).toMatch(/'HubSpot', 'software', 450/);
    expect(sql).toContain('NULL');
    expect(sql).toContain('created_by');
  });

  it('zet de notificatie-trigger uit rond de vaste-lasten-inserts en weer aan', () => {
    const off = sql.indexOf('DISABLE TRIGGER finance_fixed_costs_notify');
    const ins = sql.indexOf('INSERT INTO public.finance_fixed_costs');
    const on = sql.indexOf('ENABLE TRIGGER finance_fixed_costs_notify');
    expect(off).toBeGreaterThan(-1);
    expect(off).toBeLessThan(ins);
    expect(on).toBeGreaterThan(ins);
  });

  it('is veilig tegen herhaald draaien (geen dubbele vaste lasten)', () => {
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM public.finance_fixed_costs');
  });

  it('negeert categorie met hoofdletters/spaties', () => {
    const s = buildImportSql({ companies, targets: [], expenses: [exp({ name: 'X', category: ' Software ' })], mapping: { c1: 1 } });
    expect(s).toMatch(/'X', 'software'/);
  });
});
