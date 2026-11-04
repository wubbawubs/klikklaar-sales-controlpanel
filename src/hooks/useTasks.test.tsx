import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useMyOpenTaskCount } from './useTasks';

let calls: { table: string; ops: [string, unknown[]][] }[] = [];
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }));
vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'lte', 'insert', 'update', 'delete']) chain[m] = (...a: unknown[]) => { rec.ops.push([m, a]); return chain; };
      chain.then = (res: (v: unknown) => void) => res({ data: [], error: null, count: 3 });
      return chain;
    },
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const has = (op: string, args: unknown[]) =>
  calls.some(c => c.table === 'crm_tasks' && c.ops.some(([o, a]) => o === op && JSON.stringify(a) === JSON.stringify(args)));

describe('task hooks', () => {
  beforeEach(() => { calls = []; toastSuccess.mockClear(); });

  it('useTasks: org, embeds, filters, hides closed by default', async () => {
    const { result } = renderHook(() => useTasks({ ownerId: 'u1', dealId: 'd1' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('select', ['*, deal:deals(title), company:companies(name), contact:contacts(name)'])).toBe(true);
    expect(has('eq', ['org_id', 'org1'])).toBe(true);
    expect(has('eq', ['owner_id', 'u1'])).toBe(true);
    expect(has('eq', ['deal_id', 'd1'])).toBe(true);
    expect(has('not', ['status', 'in', '(done,cancelled)'])).toBe(true);
  });

  it('useTasks: includeClosed skips the status filter', async () => {
    const { result } = renderHook(() => useTasks({ includeClosed: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('not', ['status', 'in', '(done,cancelled)'])).toBe(false);
  });

  it('useCreateTask inserts with org_id', async () => {
    const { result } = renderHook(() => useCreateTask(), { wrapper });
    await result.current.mutateAsync({ title: 'Bel Unica' });
    expect(has('insert', [{ title: 'Bel Unica', org_id: 'org1' }])).toBe(true);
  });

  it('useUpdateTask stamps completion and clears it on reopen', async () => {
    const { result } = renderHook(() => useUpdateTask(), { wrapper });
    await result.current.mutateAsync({ id: 't1', patch: { status: 'done' } });
    const done = calls.find(c => c.ops.some(([o]) => o === 'update'))!.ops.find(([o]) => o === 'update')![1][0] as Record<string, unknown>;
    expect(done.completed_by).toBe('u1');
    expect(typeof done.completed_at).toBe('string');
    calls = [];
    await result.current.mutateAsync({ id: 't1', patch: { status: 'open' } });
    expect(has('update', [{ status: 'open', completed_at: null, completed_by: null }])).toBe(true);
    expect(has('eq', ['id', 't1'])).toBe(true);
  });

  it('useDeleteTask deletes by id and toasts', async () => {
    const { result } = renderHook(() => useDeleteTask(), { wrapper });
    await result.current.mutateAsync('t1');
    expect(has('delete', [])).toBe(true);
    expect(has('eq', ['id', 't1'])).toBe(true);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Taak verplaatst naar prullenbak'));
  });

  it('useMyOpenTaskCount: head count of my open overdue+today', async () => {
    const { result } = renderHook(() => useMyOpenTaskCount(), { wrapper });
    await waitFor(() => expect(result.current.data).toBe(3));
    expect(has('select', ['id', { count: 'exact', head: true }])).toBe(true);
    expect(has('eq', ['owner_id', 'u1'])).toBe(true);
    expect(calls.some(c => c.ops.some(([o]) => o === 'lte'))).toBe(true);
  });
});
