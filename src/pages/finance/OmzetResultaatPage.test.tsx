import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import OmzetResultaatPage from './OmzetResultaatPage';
import type { FinanceCompany } from '@/lib/finance/types';

const filter = { companyId: 'all' as string, mode: 'full' as 'full' | 'share', month: '2026-02-01' };
vi.mock('./FinanceFilter', () => ({ useFinanceFilter: () => filter }));

const co = (o: Partial<FinanceCompany>): FinanceCompany => ({
  id: 'a', exact_division: 1, name: 'Alfa', legal_name: null, ownership_pct: 100, min_buffer: 0,
  excluded: false, last_synced_at: '2026-02-18T10:00:00Z', sync_error: null, created_at: '', updated_at: '', ...o,
});
let companies: FinanceCompany[];
const m = (company_id: string, month: string, revenue: number, costs: number) => ({ company_id, month, revenue, costs, synced_at: null });
const monthly = [
  m('a', '2026-01-01', 10000, 4000), m('a', '2026-02-01', 20000, 5000), m('a', '2026-03-01', 7000, 1000),
  m('a', '2025-01-01', 8000, 3000),
  m('x', '2026-01-01', 999000, 1000),
];
const targets = [{ company_id: 'a', month: '2026-01-01', target: 12000 }];
const years: number[][] = [];

vi.mock('@/hooks/useFinance', () => ({
  useFinanceCompanies: () => ({ data: companies, isLoading: false }),
  useFinanceMonthly: (y: number[]) => { years.push(y); return { data: monthly, isLoading: false }; },
  useFinanceTargets: () => ({ data: targets, isLoading: false }),
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  filter.companyId = 'all';
  filter.mode = 'full';
  companies = [co({ id: 'a' })];
});

const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

describe('OmzetResultaatPage', () => {
  it('toont kolomkoppen en twaalf maandrijen', () => {
    render(<OmzetResultaatPage />);
    for (const h of ['Omzet', 'Target', 'Kosten', 'Resultaat', 'Vorig jaar']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^maand-/)).toHaveLength(12);
    expect(years[0]).toEqual([2025, 2026]);
  });

  it('resultaat = omzet min kosten, met target en vorig jaar; uitgesloten bedrijf telt niet', () => {
    render(<OmzetResultaatPage />);
    const jan = cells(screen.getByTestId('maand-2026-01'));
    expect(jan.slice(1)).toEqual(['€ 10.000', '€ 12.000', '€ 4.000', '€ 6.000', '€ 8.000']);
  });

  it('totaalrij YTD telt t/m geselecteerde maand', () => {
    render(<OmzetResultaatPage />);
    const tot = cells(screen.getByTestId('totaal-ytd'));
    expect(tot.slice(1)).toEqual(['€ 30.000', '€ 12.000', '€ 9.000', '€ 21.000', '€ 8.000']);
  });

  it('past aandeel toe', () => {
    companies = [co({ id: 'a', ownership_pct: 50 })];
    filter.mode = 'share';
    render(<OmzetResultaatPage />);
    expect(cells(screen.getByTestId('totaal-ytd')).slice(1)).toEqual(['€ 15.000', '€ 6.000', '€ 4.500', '€ 10.500', '€ 4.000']);
  });

  it('maand zonder data toont streepje', () => {
    render(<OmzetResultaatPage />);
    expect(cells(screen.getByTestId('maand-2026-06')).slice(1)).toEqual(['—', '—', '—', '—', '—']);
  });
});
