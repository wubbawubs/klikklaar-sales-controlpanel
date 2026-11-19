import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BedrijvenPage from './BedrijvenPage';
import type { FinanceCompany } from '@/lib/finance/types';

const filter = { companyId: 'all' as string, mode: 'full' as const, month: '2026-11-01' };
vi.mock('./FinanceFilter', () => ({ useFinanceFilter: () => filter }));

const co = (o: Partial<FinanceCompany>): FinanceCompany => ({
  id: 'a', exact_division: 1, name: 'Alfa', legal_name: null, ownership_pct: 100, min_buffer: 1000, excluded: false,
  last_synced_at: null, sync_error: null, created_at: '', updated_at: '', ...o,
});
const companies = [co({ id: 'a', name: 'Alfa', sync_error: 'Token verlopen' }), co({ id: 'x', name: 'Spook', excluded: true })];
let me: { has_access: boolean; level: 'view' | 'manage' | null; is_super_admin: boolean };
const updateAsync = vi.fn();
const upsertAsync = vi.fn();
const companiesOpts: unknown[] = [];
vi.mock('@/hooks/useFinance', () => ({
  useFinanceMe: () => ({ data: me }),
  useFinanceCompanies: (o: unknown) => { companiesOpts.push(o); return { data: companies, isLoading: false }; },
  useFinanceTargets: () => ({ data: [{ company_id: 'a', month: '2026-03-01', target: 5000 }], isLoading: false }),
  useUpdateFinanceCompany: () => ({ mutateAsync: updateAsync, isPending: false }),
  useUpsertTarget: () => ({ mutateAsync: upsertAsync, isPending: false }),
}));
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) } }));

const setup = (path = '/finance/bedrijven') => render(<MemoryRouter initialEntries={[path]}><BedrijvenPage /></MemoryRouter>);

beforeEach(() => {
  me = { has_access: true, level: 'manage', is_super_admin: false };
  [updateAsync, upsertAsync, invoke, toastSuccess, toastError].forEach((f) => f.mockReset());
  updateAsync.mockResolvedValue(undefined);
  upsertAsync.mockResolvedValue(undefined);
});

describe('BedrijvenPage', () => {
  it('vraagt ook uitgesloten bedrijven op en toont syncfout', () => {
    me = { has_access: true, level: 'view', is_super_admin: true };
    setup();
    expect(companiesOpts[0]).toEqual({ includeExcluded: true });
    expect(screen.getByText('Token verlopen')).toBeInTheDocument();
    expect(screen.getByTestId('bedrijf-x')).toHaveTextContent(/uitgesloten/i);
  });

  it('manage kan aandeel, buffer opslaan en 12 targets invullen; geen uitsluiten/koppelen', async () => {
    setup();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exact koppelen' })).not.toBeInTheDocument();
    const row = screen.getByTestId('bedrijf-a');
    fireEvent.change(within(row).getByLabelText('Aandeel % Alfa'), { target: { value: '60' } });
    fireEvent.change(within(row).getByLabelText('Minimumbuffer Alfa'), { target: { value: '2500' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Opslaan' }));
    await waitFor(() => expect(updateAsync).toHaveBeenCalledWith({ id: 'a', ownership_pct: 60, min_buffer: 2500 }));

    expect(screen.getAllByLabelText(/^Target /)).toHaveLength(12);
    expect((screen.getByLabelText('Target 2026-03') as HTMLInputElement).value).toBe('5000');
    fireEvent.change(screen.getByLabelText('Target 2026-04'), { target: { value: '7000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Targets opslaan' }));
    await waitFor(() => expect(upsertAsync).toHaveBeenCalledWith({ company_id: 'a', month: '2026-04-01', target: 7000 }));
    expect(upsertAsync).toHaveBeenCalledTimes(1);
  });

  it('view-gebruiker kan niets bewerken', () => {
    me = { has_access: true, level: 'view', is_super_admin: false };
    setup();
    expect(screen.queryByLabelText('Aandeel % Alfa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Opslaan' })).not.toBeInTheDocument();
  });

  it('super admin: uitsluiten-schakelaar patcht alleen excluded', async () => {
    me = { has_access: true, level: 'view', is_super_admin: true };
    setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Uitsluiten Alfa' }));
    await waitFor(() => expect(updateAsync).toHaveBeenCalledWith({ id: 'a', excluded: true }));
  });

  it('Exact koppelen roept exact-auth/start en navigeert', async () => {
    me = { has_access: true, level: 'view', is_super_admin: true };
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    invoke.mockResolvedValue({ data: { url: 'https://exact.example/auth' }, error: null });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Exact koppelen' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://exact.example/auth'));
    expect(invoke).toHaveBeenCalledWith('exact-auth/start', { method: 'GET' });
  });

  it('toast bij ?exact=connected en ?exact=error', () => {
    const { unmount } = setup('/finance/bedrijven?exact=connected');
    expect(toastSuccess).toHaveBeenCalledWith('Exact gekoppeld');
    unmount();
    setup('/finance/bedrijven?exact=error');
    expect(toastError).toHaveBeenCalledWith('Exact koppelen mislukt');
  });
});
