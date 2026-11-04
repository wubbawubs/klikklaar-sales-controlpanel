import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }));
vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const rpc = vi.fn(async (..._args: unknown[]) => rpcResult);
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useIsOrgAdmin, useRestoreBatch, usePurge } from './useTrash';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useTrash hooks', () => {
  beforeEach(() => { rpc.mockClear(); toastError.mockClear(); toastSuccess.mockClear(); rpcResult = { data: null, error: null }; });

  it('asks the database whether the current user is an org admin', async () => {
    rpcResult = { data: true, error: null };
    const { result } = renderHook(() => useIsOrgAdmin(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(true));
    // only ever about the caller: the 1-arg version (auth.uid() in the database), never another user id
    expect(rpc).toHaveBeenCalledWith('is_org_admin', { _org: 'org1' });
  });

  it('shows the database message when a restore is refused', async () => {
    rpcResult = { data: null, error: { message: 'Dit item staat in de prullenbak' } };
    const { result } = renderHook(() => useRestoreBatch(), { wrapper });
    await act(async () => { await result.current.mutateAsync('b1').catch(() => undefined); });
    expect(rpc).toHaveBeenCalledWith('crm_restore', { p_batch: 'b1' });
    expect(toastError).toHaveBeenCalledWith('Dit item staat in de prullenbak');
  });

  it('purges by entity and record id', async () => {
    rpcResult = { data: 1, error: null };
    const { result } = renderHook(() => usePurge(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ entity: 'deals', recordId: 'r1' }); });
    expect(rpc).toHaveBeenCalledWith('crm_purge', { p_entity: 'deals', p_record_id: 'r1' });
  });
});
