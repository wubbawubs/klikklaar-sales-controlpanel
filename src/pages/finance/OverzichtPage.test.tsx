import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import OverzichtPage from './OverzichtPage';
import type { FinanceCompany } from '@/lib/finance/types';

const filter = { companyId: 'all' as string, mode: 'full' as 'full' | 'share', month: '2026-11-01' };
vi.mock('./FinanceFilter', () => ({ useFinanceFilter: () => filter }));

const co = (o: Partial<FinanceCompany>): FinanceCompany => ({
  id: 'a', exact_division: 1, name: 'Alfa', legal_name: null, ownership_pct: 100, min_buffer: 0,
  excluded: false, last_synced_at: '2026-11-18T10:00:00Z', sync_error: null, created_at: '', updated_at: '', ...o,
});
let companies: FinanceCompany[];
const m = (company_id: string, month: string, revenue: number, costs: number) => ({ company_id, month, revenue, costs, synced_at: null });
const monthly = [
  m('a', '2026-11-01', 80000, 50000), m('a', '2026-10-01', 100000, 60000), m('a', '2025-11-01', 90000, 50000),
  m('b', '2026-11-01', 20000, 10000),
  m('x', '2026-11-01', 999000, 1000),
];
const bank = [
  { id: '1', company_id: 'a', account_code: '1', name: 'n', balance: 100000, last_statement_date: null, synced_at: null },
  { id: '2', company_id: 'x', account_code: '1', name: 'n', balance: 5000000, last_statement_date: null, synced_at: null },
];
const items = [
  { id: 'i1', company_id: 'a', kind: 'receivable', exact_id: '1', invoice_number: null, counterparty: 'k', amount: 40000, invoice_date: null, due_date: '2020-01-01', synced_at: null },
];
const targets = [{ company_id: 'a', month: '2026-11-01', target: 100000 }];

vi.mock('@/hooks/useFinance', () => ({
  useFinanceCompanies: () => ({ data: companies, isLoading: false }),
  useFinanceMonthly: () => ({ data: monthly, isLoading: false }),
  useFinanceBank: () => ({ data: bank, isLoading: false }),
  useFinanceOpenItems: () => ({ data: items, isLoading: false }),
  useFinanceTargets: () => ({ data: targets, isLoading: false }),
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  filter.companyId = 'all';
  filter.mode = 'full';
  companies = [co({ id: 'a', name: 'Alfa' }), co({ id: 'b', name: 'Beta', last_synced_at: null })];
});

describe('OverzichtPage', () => {
  it('toont vijf tegels met exacte labels en groepslabel', () => {
    render(<OverzichtPage />);
    for (const l of ['Banksaldo', 'Omzet november vs target', 'Omzet YTD', 'Resultaat YTD', 'Open debiteuren']) {
      // 'Resultaat YTD' staat ook als regel op de bedrijfskaarten
      expect(screen.getAllByText(l).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getAllByText('Resultaat YTD').length).toBe(3); // tegel + 2 kaarten
    expect(screen.getByText(/excl\. intercompany/)).toBeInTheDocument();
    expect(screen.queryByText(/Top open deals/i)).not.toBeInTheDocument();
  });

  it('negeert data van uitgesloten bedrijven (R3)', () => {
    render(<OverzichtPage />);
    const tile = screen.getByText('Banksaldo').closest('div')!.parentElement!;
    expect(within(tile).getByText('€ 100.000')).toBeInTheDocument();
  });

  it('aandeel-modus halveert een bedrijf met 50%', () => {
    companies = [co({ id: 'a', name: 'Alfa', ownership_pct: 50 })];
    filter.mode = 'share';
    render(<OverzichtPage />);
    const tile = screen.getByText('Banksaldo').closest('div')!.parentElement!;
    expect(within(tile).getByText('€ 50.000')).toBeInTheDocument();
  });

  it('bedrijf zonder sync toont melding en streepje', () => {
    render(<OverzichtPage />);
    const card = screen.getByTestId('company-card-b');
    expect(within(card).getByText(/nog niet gesynchroniseerd/i)).toBeInTheDocument();
    expect(within(card).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('bedrijfsfilter toont alleen dat bedrijf', () => {
    filter.companyId = 'a';
    render(<OverzichtPage />);
    expect(screen.getByTestId('company-card-a')).toBeInTheDocument();
    expect(screen.queryByTestId('company-card-b')).not.toBeInTheDocument();
  });
});
