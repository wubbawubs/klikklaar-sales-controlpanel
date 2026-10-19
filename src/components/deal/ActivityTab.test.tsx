import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityTab } from './ActivityTab';

// Controls whether the deal_activities insert succeeds or fails per test.
let insertError: { message: string } | null = null;
const insertSpy = vi.fn(async () => ({ error: insertError }));

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));
vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
vi.mock('@/integrations/supabase/client', () => {
  // Generic thenable query chain: any filter/order call returns the chain, awaiting it yields no rows.
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => ({ ...chain, insert: insertSpy }),
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

type DealProp = Parameters<typeof ActivityTab>[0]['deal'];
const deal = { id: 'd1', org_id: 'org1', title: 'Unica', company_id: null, contact_id: null, stage_id: 's1', value_eur: null, assigned_to: null } as unknown as DealProp;
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('ActivityTab note saving', () => {
  beforeEach(() => { insertError = null; insertSpy.mockClear(); toastSuccess.mockClear(); toastError.mockClear(); });

  it('clears the field and confirms when the note is saved', async () => {
    wrap(<ActivityTab deal={deal} />);
    const field = screen.getByPlaceholderText('Voeg een notitie toe...') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Belafspraak volgende week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Opgeslagen'));
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(field.value).toBe('');
  });

  it('keeps the text and shows an error when saving fails', async () => {
    insertError = { message: 'new row violates row-level security policy' };
    wrap(<ActivityTab deal={deal} />);
    const field = screen.getByPlaceholderText('Voeg een notitie toe...') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Belangrijke notitie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The note must not silently disappear: text stays so the user can retry.
    expect(field.value).toBe('Belangrijke notitie');
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
