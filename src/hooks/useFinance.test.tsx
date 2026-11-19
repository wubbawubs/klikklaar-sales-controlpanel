import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFinanceMe, useFinanceCompanies, useRefreshExact } from './useFinance';

let calls: { table: string; ops: [string, unknown[]][] }[] = [];
const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (table: string) => {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'upsert', 'update', 'insert']) chain[m] = (...a: unknown[]) => { rec.ops.push([m, a]); return chain; };
      chain.then = (res: (v: unknown) => void) => res({ data: [], error: null });
      return chain;
    },
  },
}));

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const has = (table: string, op: string, args: unknown[]) =>
  calls.some(c => c.table === table && c.ops.some(([o, a]) => o === op && JSON.stringify(a) === JSON.stringify(args)));

describe('finance hooks', () => {
  beforeEach(() => {
    calls = [];
    rpc.mockReset();
    invoke.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('useFinanceMe calls rpc finance_me and unwraps the row', async () => {
    rpc.mockResolvedValue({ data: [{ has_access: true, level: 'manage', is_super_admin: false }], error: null });
    const { result } = renderHook(() => useFinanceMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('finance_me');
    expect(result.current.data).toEqual({ has_access: true, level: 'manage', is_super_admin: false });
  });

  it('useFinanceMe falls back to no access when rpc returns no row', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useFinanceMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ has_access: false, level: null, is_super_admin: false });
  });

  it('useFinanceCompanies hides excluded companies by default', async () => {
    const { result } = renderHook(() => useFinanceCompanies(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('finance_companies', 'eq', ['excluded', false])).toBe(true);
  });

  it('useFinanceCompanies({ includeExcluded }) does not filter', async () => {
    const { result } = renderHook(() => useFinanceCompanies({ includeExcluded: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.some(c => c.table === 'finance_companies')).toBe(true);
    expect(has('finance_companies', 'eq', ['excluded', false])).toBe(false);
  });

  it('useRefreshExact invokes exact-sync and invalidates finance queries', async () => {
    invoke.mockResolvedValue({ data: { synced: 2, failed: 0, remaining: 0 }, error: null });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRefreshExact(), { wrapper });
    await act(async () => { await result.current.mutateAsync(undefined); });
    expect(invoke).toHaveBeenCalledWith('exact-sync', { body: {} });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['finance'] });
  });
});
