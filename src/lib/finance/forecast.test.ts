import { describe, it, expect } from 'vitest';
import { forecast13Weeks } from './forecast';
import type { FixedCost, OpenItem } from './types';

const item = (kind: 'receivable' | 'payable', amount: number, due_date: string | null): OpenItem => ({
  id: Math.random().toString(), company_id: 'c', kind, exact_id: 'x', invoice_number: null,
  counterparty: 'T', amount, invoice_date: null, due_date, synced_at: null,
});
const fc = (monthly_amount: number, active = true): FixedCost => ({
  id: 'f', company_id: 'c', name: 'n', category: 'overig', monthly_amount,
  exact_supplier_code: null, active, created_by: null, created_at: '', updated_at: '',
});

// 2026-11-19 is een donderdag; week 1 start maandag 2026-11-16
const today = '2026-11-19';

describe('forecast13Weeks', () => {
  it('geeft 13 weken met maandag-start', () => {
    const r = forecast13Weeks({ startBalance: 0, items: [], fixedCosts: [], today });
    expect(r).toHaveLength(13);
    expect(r[0].weekStart).toBe('2026-11-16');
    expect(r[1].weekStart).toBe('2026-11-23');
  });
  it('plaatst posten in de juiste week en telt vaste lasten mee', () => {
    const r = forecast13Weeks({
      startBalance: 1000,
      items: [item('receivable', 500, '2026-11-29'), item('payable', 200, '2026-11-18')],
      fixedCosts: [fc(430), fc(999, false)],
      today,
    });
    const fixed = (430 * 12) / 52;
    expect(r[0].inflow).toBe(0);
    expect(r[0].outflow).toBeCloseTo(200 + fixed);
    expect(r[1].inflow).toBe(500);
    expect(r[0].balance).toBeCloseTo(1000 - 200 - fixed);
    expect(r[1].balance).toBeCloseTo(1000 - 200 - 2 * fixed + 500);
  });
  it('zet te late debiteur in week 1', () => {
    const r = forecast13Weeks({ startBalance: 0, items: [item('receivable', 300, '2026-10-10')], fixedCosts: [], today });
    expect(r[0].inflow).toBe(300);
  });
  it('negeert posten voorbij week 13', () => {
    const r = forecast13Weeks({ startBalance: 0, items: [item('receivable', 300, '2027-06-01')], fixedCosts: [], today });
    expect(r.reduce((s, w) => s + w.inflow, 0)).toBe(0);
  });
});
