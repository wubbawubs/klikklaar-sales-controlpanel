import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import RapportagePage from './RapportagePage';
import type { FinanceCompany } from '@/lib/finance/types';

const filter = { companyId: 'all' as string, mode: 'full' as 'full' | 'share', month: '2026-11-01' };
vi.mock('./FinanceFilter', () => ({ useFinanceFilter: () => filter }));

const co = (o: Partial<FinanceCompany>): FinanceCompany => ({
  id: 'a', exact_division: 1, name: 'Alfa', legal_name: null, ownership_pct: 100, min_buffer: 0, excluded: false,
  last_synced_at: '2026-11-18T10:00:00Z', sync_error: null, created_at: '', updated_at: '', ...o,
});
const companies = [co({ id: 'a', name: 'Alfa' }), co({ id: 'b', name: 'Beta', ownership_pct: 50 }), co({ id: 'x', name: 'Spook', excluded: true })];
const m = (company_id: string, month: string, revenue: number, costs: number) => ({ company_id, month, revenue, costs, synced_at: null });
const monthly = [m('a', '2026-11-01', 80000, 50000), m('b', '2026-11-01', 20000, 10000), m('a', '2026-10-01', 5000, 1000), m('x', '2026-11-01', 777000, 1)];
const bank = [
  { id: '1', company_id: 'a', account_code: '1', name: 'ING', balance: 100000, last_statement_date: null, synced_at: null },
  { id: '2', company_id: 'b', account_code: '2', name: 'ING', balance: 40000, last_statement_date: null, synced_at: null },
  { id: '3', company_id: 'x', account_code: '3', name: 'ING', balance: 9000000, last_statement_date: null, synced_at: null },
];
const item = (id: string, company_id: string, kind: 'receivable' | 'payable', amount: number, due: string) => ({
  id, company_id, kind, exact_id: id, invoice_number: id, counterparty: 'k', amount, invoice_date: null, due_date: due, synced_at: null,
});
const items = [item('i1', 'a', 'receivable', 40000, '2020-01-01'), item('i2', 'a', 'receivable', 10000, '2999-01-01')];
const targets = [{ company_id: 'a', month: '2026-11-01', target: 100000 }];

vi.mock('@/hooks/useFinance', () => ({
  useFinanceCompanies: () => ({ data: companies, isLoading: false }),
  useFinanceMonthly: () => ({ data: monthly, isLoading: false }),
  useFinanceBank: () => ({ data: bank, isLoading: false }),
  useFinanceOpenItems: () => ({ data: items, isLoading: false }),
  useFinanceTargets: () => ({ data: targets, isLoading: false }),
  useFinanceFixedCosts: () => ({ data: [], isLoading: false }),
}));

beforeEach(() => { filter.companyId = 'all'; filter.mode = 'full'; });

describe('RapportagePage', () => {
  it('bevat kop en de vier secties', () => {
    render(<RapportagePage />);
    expect(screen.getByRole('heading', { name: /OneGroup — Financieel overzicht november 2026/ })).toBeInTheDocument();
    for (const h of ['Banksaldi', 'Omzet november vs target', 'Prognose 13 weken', 'Open debiteuren']) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(/Exact bijgewerkt/)).toBeInTheDocument();
  });

  it('toont alleen toegankelijke (niet-uitgesloten) bedrijven en telt groep op', () => {
    render(<RapportagePage />);
    expect(screen.queryByText('Spook')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('bank-totaal')).getByText('€ 140.000')).toBeInTheDocument();
    expect(within(screen.getByTestId('deb-totaal')).getByText('€ 50.000')).toBeInTheDocument();
    expect(within(screen.getByTestId('deb-totaal')).getByText(/€ 40\.000 te laat/)).toBeInTheDocument();
  });

  it('volgt aandeelmodus', () => {
    filter.mode = 'share';
    render(<RapportagePage />);
    expect(within(screen.getByTestId('bank-totaal')).getByText('€ 120.000')).toBeInTheDocument();
  });

  it('eigen selectors starten op filterwaarden en kiezen bedrijf en maand', () => {
    render(<RapportagePage />);
    expect((screen.getByLabelText('Maand') as HTMLInputElement).value).toBe('2026-11');
    fireEvent.change(screen.getByLabelText('Bedrijf'), { target: { value: 'b' } });
    expect(within(screen.getByTestId('bank-totaal')).getByText('€ 40.000')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Maand'), { target: { value: '2026-10' } });
    expect(screen.getByRole('heading', { name: 'Omzet oktober vs target' })).toBeInTheDocument();
  });

  it('Download PDF roept window.print', () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    render(<RapportagePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
