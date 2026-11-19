import { describe, it, expect } from 'vitest';
import { applyShare, companySummary, groupSummary } from './aggregate';
import type { FinanceCompany, MonthlyRow, OpenItem, BankAccount } from './types';

const company = (o: Partial<FinanceCompany> = {}): FinanceCompany => ({
  id: 'c1', exact_division: 1, name: 'A', legal_name: null, ownership_pct: 100, min_buffer: 0,
  excluded: false, last_synced_at: '2026-11-19T05:00:00Z', sync_error: null, created_at: '', updated_at: '', ...o,
});
const m = (month: string, revenue: number, costs = 0): MonthlyRow => ({ company_id: 'c1', month, revenue, costs, synced_at: null });
const bank = (balance: number): BankAccount => ({ id: 'b', company_id: 'c1', account_code: '1', name: 'b', balance, last_statement_date: null, synced_at: null });
const it_ = (kind: 'receivable' | 'payable', amount: number, due_date: string): OpenItem => ({
  id: Math.random().toString(), company_id: 'c1', kind, exact_id: 'x', invoice_number: null, counterparty: 't',
  amount, invoice_date: null, due_date, synced_at: null,
});
const opts = { month: '2026-11-01', today: '2026-11-19', mode: 'full' as const };
const empty = { monthly: [], bank: [], items: [], targets: [] };

describe('applyShare', () => {
  it('rekent aandeel', () => expect(applyShare(1000, company({ ownership_pct: 40 }), 'share')).toBe(400));
  it('full geeft volledig bedrag', () => expect(applyShare(1000, company({ ownership_pct: 40 }), 'full')).toBe(1000));
  it('0% geeft 0', () => expect(applyShare(1000, company({ ownership_pct: 0 }), 'share')).toBe(0));
});

describe('companySummary', () => {
  it('geen target voor de maand geeft null', () => {
    const s = companySummary(company(), { ...empty, monthly: [m('2026-11-01', 100)] }, opts);
    expect(s.targetMonth).toBeNull();
    expect(s.targetPct).toBeNull();
  });
  it('nooit gesynchroniseerd geeft unknown en null-velden, maar 0 voor items', () => {
    const s = companySummary(company({ last_synced_at: null }), empty, opts);
    expect(s.health).toBe('unknown');
    expect(s.bank).toBeNull();
    expect(s.revenueMonth).toBeNull();
    expect(s.receivables).toBe(0);
    expect(s.overdue).toBe(0);
    expect(s.payables).toBe(0);
  });
  it('YTD en vorig jaar YTD, resultaat', () => {
    const monthly = [
      m('2026-01-01', 100, 40), m('2026-11-01', 50, 10), m('2026-12-01', 999, 0),
      m('2025-01-01', 70), m('2025-11-01', 30), m('2025-12-01', 500),
    ];
    const s = companySummary(company(), { ...empty, monthly }, opts);
    expect(s.revenueMonth).toBe(50);
    expect(s.revenueYtd).toBe(150);
    expect(s.revenuePrevYtd).toBe(100);
    expect(s.resultYtd).toBe(100);
  });
  it('past share toe op alle bedragen', () => {
    const s = companySummary(company({ ownership_pct: 50 }), {
      ...empty, monthly: [m('2026-11-01', 100, 20)], bank: [bank(1000)], items: [it_('receivable', 200, '2026-11-01')],
    }, { ...opts, mode: 'share' });
    expect(s.revenueMonth).toBe(50);
    expect(s.bank).toBe(500);
    expect(s.receivables).toBe(100);
    expect(s.overdue).toBe(100);
    expect(s.resultYtd).toBe(40);
  });
  it('overdue is som receivables met due_date < today', () => {
    const s = companySummary(company(), {
      ...empty, items: [it_('receivable', 100, '2026-11-18'), it_('receivable', 50, '2026-11-19'), it_('payable', 70, '2026-11-01')],
    }, opts);
    expect(s.overdue).toBe(100);
    expect(s.receivables).toBe(150);
    expect(s.payables).toBe(70);
  });
  describe('health', () => {
    const t = (target: number) => [{ company_id: 'c1', month: '2026-11-01', target }];
    it('sync_error is critical', () =>
      expect(companySummary(company({ sync_error: 'boom' }), empty, opts).health).toBe('critical'));
    it('targetPct < 0.6 is critical', () =>
      expect(companySummary(company(), { ...empty, monthly: [m('2026-11-01', 50)], targets: t(100) }, opts).health).toBe('critical'));
    it('bank < min_buffer is critical', () =>
      expect(companySummary(company({ min_buffer: 500 }), { ...empty, bank: [bank(100)] }, opts).health).toBe('critical'));
    it('targetPct < 0.85 is warning', () =>
      expect(companySummary(company(), { ...empty, monthly: [m('2026-11-01', 70)], targets: t(100) }, opts).health).toBe('warning'));
    it('overdue > 25% van receivables is warning', () =>
      expect(companySummary(company(), { ...empty, items: [it_('receivable', 70, '2026-11-01'), it_('receivable', 100, '2026-12-01')] }, opts).health).toBe('warning'));
    it('anders good', () =>
      expect(companySummary(company(), { ...empty, monthly: [m('2026-11-01', 100)], targets: t(100) }, opts).health).toBe('good'));
  });
});

describe('groupSummary', () => {
  it('telt op en berekent targetPct over bedrijven met target', () => {
    const a = companySummary(company({ id: 'a' }), { ...empty, monthly: [m('2026-11-01', 100)], targets: [{ company_id: 'a', month: '2026-11-01', target: 200 }] }, opts);
    const b = companySummary(company({ id: 'b' }), { ...empty, monthly: [m('2026-11-01', 50)] }, opts);
    const g = groupSummary([a, b]);
    expect(g.targetPct).toBe(0.5);
    expect(g.revenueMonth).toBe(150);
  });
  it('null-velden tellen niet mee en alles-null blijft null', () => {
    const u = companySummary(company({ last_synced_at: null }), empty, opts);
    const g = groupSummary([u]);
    expect(g.bank).toBeNull();
    expect(g.receivables).toBe(0);
  });
});
