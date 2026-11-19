import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import DebiteurenPage from './DebiteurenPage';
import type { FinanceCompany } from '@/lib/finance/types';

const filter = { companyId: 'all' as string, mode: 'share' as 'full' | 'share', month: '2026-11-01' };
vi.mock('./FinanceFilter', () => ({ useFinanceFilter: () => filter }));

const co = (id: string, name: string, excluded = false): FinanceCompany => ({
  id, exact_division: 1, name, legal_name: null, ownership_pct: 50, min_buffer: 0, excluded,
  last_synced_at: null, sync_error: null, created_at: '', updated_at: '',
});
const companies = [co('a', 'Alfa'), co('b', 'Beta'), co('x', 'Uitgesloten', true)];
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const it_ = (id: string, company_id: string, nr: string, amount: number, due: string | null) => ({
  id, company_id, kind: 'receivable' as const, exact_id: id, invoice_number: nr, counterparty: `Klant ${nr}`,
  amount, invoice_date: null, due_date: due, synced_at: null,
});
const items = [
  it_('1', 'a', 'F-OK', 1000, day(10)),
  it_('2', 'a', 'F-LAAT5', 2000, day(-5)),
  it_('3', 'b', 'F-LAAT30', 3000, day(-30)),
  it_('4', 'x', 'F-SPOOK', 9000, day(-90)),
];
vi.mock('@/hooks/useFinance', () => ({
  useFinanceCompanies: () => ({ data: companies, isLoading: false }),
  useFinanceOpenItems: () => ({ data: items, isLoading: false }),
}));

beforeEach(() => { filter.companyId = 'all'; });

const invoiceOrder = () => screen.getAllByTestId(/^factuur-/).map((r) => r.getAttribute('data-testid'));

describe('DebiteurenPage', () => {
  it('toont kolommen en sorteert op dagen te laat aflopend; uitgesloten bedrijf ontbreekt', () => {
    render(<DebiteurenPage />);
    for (const h of ['Bedrijf', 'Factuur', 'Klant', 'Bedrag', 'Vervaldatum', 'Dagen te laat']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    expect(invoiceOrder()).toEqual(['factuur-3', 'factuur-2', 'factuur-1']);
    expect(within(screen.getByTestId('factuur-3')).getByText('30')).toBeInTheDocument();
  });

  it('toont volledige bedragen (geen aandeel) met noot, zonder bewerkknoppen', () => {
    render(<DebiteurenPage />);
    expect(within(screen.getByTestId('factuur-3')).getByText('€ 3.000')).toBeInTheDocument();
    expect(screen.getByText(/altijd 100%/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('filter Alleen te laat', () => {
    render(<DebiteurenPage />);
    fireEvent.click(screen.getByLabelText('Alleen te laat'));
    expect(invoiceOrder()).toEqual(['factuur-3', 'factuur-2']);
  });

  it('bedrijfsfilter', () => {
    filter.companyId = 'a';
    render(<DebiteurenPage />);
    expect(invoiceOrder()).toEqual(['factuur-2', 'factuur-1']);
  });
});
