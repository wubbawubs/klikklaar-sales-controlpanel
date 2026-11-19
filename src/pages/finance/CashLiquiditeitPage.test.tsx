import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CashLiquiditeitPage from './CashLiquiditeitPage';
import type { FinanceCompany } from '@/lib/finance/types';

const filter = { companyId: 'all' as string, mode: 'full' as 'full' | 'share', month: '2026-11-01' };
vi.mock('./FinanceFilter', () => ({ useFinanceFilter: () => filter }));
vi.mock('@/components/finance/FixedCostDialog', async (orig) => ({
  ...(await orig<typeof import('@/components/finance/FixedCostDialog')>()),
  FixedCostDialog: () => null,
}));
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AreaChart: ({ data }: { data: unknown[] }) => <div data-testid="forecast-chart" data-json={JSON.stringify(data)} />,
  };
});

const co = (o: Partial<FinanceCompany>): FinanceCompany => ({
  id: 'a', exact_division: 1, name: 'Alfa', legal_name: null, ownership_pct: 100, min_buffer: 10000,
  excluded: false, last_synced_at: '2026-11-18T10:00:00Z', sync_error: null, created_at: '', updated_at: '', ...o,
});
let companies: FinanceCompany[];
let me: { has_access: boolean; level: 'view' | 'manage' | null; is_super_admin: boolean };

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const bank = [
  { id: '1', company_id: 'a', account_code: '1', name: 'ING Alfa', balance: 60000, last_statement_date: daysAgo(1), synced_at: null },
  { id: '2', company_id: 'b', account_code: '2', name: 'ING Beta', balance: 40000, last_statement_date: daysAgo(12), synced_at: null },
  { id: '3', company_id: 'x', account_code: '3', name: 'ING Uitgesloten', balance: 9999999, last_statement_date: daysAgo(1), synced_at: null },
];
const fc = (id: string, company_id: string, name: string, amount: number, code: string | null) => ({
  id, company_id, name, category: 'software' as const, monthly_amount: amount, exact_supplier_code: code,
  active: true, created_by: null, created_at: '', updated_at: '',
});
const fixed = [fc('f1', 'a', 'HubSpot', 1000, 'S1'), fc('f2', 'a', 'Google', 1000, 'S2'), fc('f3', 'b', 'Huur', 1000, null), fc('f4', 'x', 'Spook', 5000, null)];
const spend = [
  { company_id: 'a', supplier_code: 'S1', supplier_name: 'HubSpot', last_invoice_date: null, last_amount: 1200 },
  { company_id: 'a', supplier_code: 'S2', supplier_name: 'Google', last_invoice_date: null, last_amount: 1030 },
];

vi.mock('@/hooks/useFinance', () => ({
  useFinanceMe: () => ({ data: me }),
  useFinanceCompanies: () => ({ data: companies, isLoading: false }),
  useFinanceBank: () => ({ data: bank, isLoading: false }),
  useFinanceOpenItems: () => ({ data: [], isLoading: false }),
  useFinanceFixedCosts: () => ({ data: fixed, isLoading: false }),
  useFinanceSupplierSpend: () => ({ data: spend, isLoading: false }),
}));

beforeEach(() => {
  filter.companyId = 'all';
  filter.mode = 'full';
  me = { has_access: true, level: 'view', is_super_admin: false };
  companies = [co({ id: 'a', name: 'Alfa' }), co({ id: 'b', name: 'Beta', min_buffer: 5000 })];
});

describe('CashLiquiditeitPage', () => {
  it('prognose heeft 13 punten en buffer = som min_buffer zichtbare bedrijven', () => {
    render(<CashLiquiditeitPage />);
    const data = JSON.parse(screen.getByTestId('forecast-chart').getAttribute('data-json')!);
    expect(data).toHaveLength(13);
    expect(data.every((p: { buffer: number }) => p.buffer === 15000)).toBe(true);
    // startsaldo 100.000 (uitgesloten bedrijf telt niet) minus vaste lasten 3000/mnd
    expect(data[0].balance).toBeLessThan(100000);
    expect(data[0].balance).toBeGreaterThan(99000);
    expect(screen.getByText(/Te late debiteuren tellen mee in week 1/)).toBeInTheDocument();
  });

  it('banktabel markeert oud afschrift rood', () => {
    render(<CashLiquiditeitPage />);
    expect(screen.queryByText('ING Uitgesloten')).not.toBeInTheDocument();
    expect(screen.getByTestId('afschrift-2').className).toMatch(/rose|red/);
    expect(screen.getByTestId('afschrift-1').className).not.toMatch(/rose|red/);
  });

  it('echt betaald uit supplier spend en markeert afwijking > 5%', () => {
    render(<CashLiquiditeitPage />);
    const hub = screen.getByTestId('vast-f1');
    expect(within(hub).getByText('€ 1.200')).toBeInTheDocument();
    expect(hub.getAttribute('data-afwijking')).toBe('true');
    expect(screen.getByTestId('vast-f2').getAttribute('data-afwijking')).toBe('false');
    expect(within(screen.getByTestId('vast-f3')).getByText('nog niet')).toBeInTheDocument();
    expect(screen.queryByText('Spook')).not.toBeInTheDocument();
  });

  it('totaal vaste lasten en runway naar beneden afgerond', () => {
    render(<CashLiquiditeitPage />);
    expect(screen.getByTestId('totaal-vast')).toHaveTextContent('€ 3.000');
    expect(screen.getByTestId('runway')).toHaveTextContent('33 maanden'); // 100000/3000 = 33,3
  });

  it('knop alleen bij manage of super admin', () => {
    const { unmount } = render(<CashLiquiditeitPage />);
    expect(screen.queryByRole('button', { name: '+ Nieuwe maandlast' })).not.toBeInTheDocument();
    unmount();
    me = { has_access: true, level: 'manage', is_super_admin: false };
    const r = render(<CashLiquiditeitPage />);
    expect(screen.getByRole('button', { name: '+ Nieuwe maandlast' })).toBeInTheDocument();
    r.unmount();
    me = { has_access: true, level: 'view', is_super_admin: true };
    render(<CashLiquiditeitPage />);
    expect(screen.getByRole('button', { name: '+ Nieuwe maandlast' })).toBeInTheDocument();
  });
});
