import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinanceAccessCell } from './FinanceAccessCell';

type Call = [string, string, ...unknown[]];
const calls: Call[] = [];
const tables: Record<string, unknown[]> = {};
const chain = (kind: string, t: string, filters: unknown[][] = []): unknown => ({
  eq: (c: string, v: string) => chain(kind, t, [...filters, [c, v]]),
  then: (res: (v: unknown) => unknown) => { calls.push([kind, t, ...filters]); return Promise.resolve({ error: null }).then(res); },
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => Promise.resolve({ data: tables[t] ?? [], error: null }),
      delete: () => chain('delete', t),
      upsert: (row: unknown, opts: unknown) => { calls.push(['upsert', t, row, opts]); return Promise.resolve({ error: null }); },
      insert: (row: unknown) => { calls.push(['insert', t, row]); return Promise.resolve({ error: null }); },
    }),
  },
}));
vi.mock('@/hooks/useFinance', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useFinance')>()),
  useFinanceCompanies: () => ({
    data: [{ id: 'c1', name: 'Alfa', excluded: false }, { id: 'c2', name: 'Spook', excluded: true }],
    isLoading: false,
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const setup = (props: { isSuperAdminUser?: boolean } = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  render(<QueryClientProvider client={qc}><FinanceAccessCell userId="u1" isSuperAdminUser={props.isSuperAdminUser ?? false} /></QueryClientProvider>);
  return { spy };
};
const level = () => screen.getByLabelText('Finance-toegang') as HTMLSelectElement;

beforeEach(() => {
  calls.length = 0;
  tables.finance_access = [];
  tables.finance_company_access = [];
});

describe('FinanceAccessCell', () => {
  it('super_admin-gebruiker toont vaste tekst zonder controls', () => {
    setup({ isSuperAdminUser: true });
    expect(screen.getByText('Altijd alles (super admin)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('toont Geen/Kijken/Beheren en huidig niveau', async () => {
    tables.finance_access = [{ user_id: 'u1', level: 'view' }, { user_id: 'other', level: 'manage' }];
    setup();
    expect(Array.from(level().options).map((o) => o.textContent)).toEqual(['Geen', 'Kijken', 'Beheren']);
    await waitFor(() => expect(level().value).toBe('view'));
  });

  it('Beheren upsert finance_access en invalideert finance', async () => {
    const { spy } = setup();
    fireEvent.change(level(), { target: { value: 'manage' } });
    await waitFor(() => expect(calls).toContainEqual(['upsert', 'finance_access', { user_id: 'u1', level: 'manage' }, { onConflict: 'user_id' }]));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['finance'] }));
  });

  it('Geen verwijdert finance_access en alle bedrijfsrijen van de gebruiker', async () => {
    tables.finance_access = [{ user_id: 'u1', level: 'view' }];
    setup();
    await waitFor(() => expect(level().value).toBe('view'));
    fireEvent.change(level(), { target: { value: 'none' } });
    await waitFor(() => {
      expect(calls).toContainEqual(['delete', 'finance_company_access', ['user_id', 'u1']]);
      expect(calls).toContainEqual(['delete', 'finance_access', ['user_id', 'u1']]);
    });
  });

  it('popover: checkbox per bedrijf (uitgesloten gemarkeerd) schrijft en verwijdert', async () => {
    tables.finance_access = [{ user_id: 'u1', level: 'view' }];
    tables.finance_company_access = [{ user_id: 'u1', company_id: 'c2' }];
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Bedrijven/ }));
    expect(await screen.findByText(/Spook/)).toHaveTextContent(/uitgesloten/);
    fireEvent.click(screen.getByRole('checkbox', { name: /Alfa/ }));
    await waitFor(() => expect(calls).toContainEqual(['insert', 'finance_company_access', { user_id: 'u1', company_id: 'c1' }]));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Spook/ })).toBeChecked());
    fireEvent.click(screen.getByRole('checkbox', { name: /Spook/ }));
    await waitFor(() => expect(calls).toContainEqual(['delete', 'finance_company_access', ['user_id', 'u1'], ['company_id', 'c2']]));
  });
});
