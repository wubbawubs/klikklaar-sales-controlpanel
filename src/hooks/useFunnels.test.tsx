import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFunnels, useFunnelFields, useDealHistory } from './useFunnels';
import { useDeals } from './usePipeline';

let calls: { table: string; ops: [string, unknown[]][] }[] = [];
vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'or', 'order', 'limit']) chain[m] = (...a: unknown[]) => { rec.ops.push([m, a]); return chain; };
      chain.then = (res: (v: unknown) => void) => res({ data: [], error: null });
      return chain;
    },
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);
const has = (table: string, op: string, args: unknown[]) =>
  calls.some(c => c.table === table && c.ops.some(([o, a]) => o === op && JSON.stringify(a) === JSON.stringify(args)));

describe('funnel hooks', () => {
  beforeEach(() => { calls = []; });

  it('useFunnels: org, not archived, by position', async () => {
    const { result } = renderHook(() => useFunnels(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('funnels', 'eq', ['org_id', 'org1'])).toBe(true);
    expect(has('funnels', 'is', ['archived_at', null])).toBe(true);
    expect(has('funnels', 'order', ['position'])).toBe(true);
  });

  it('useFunnelFields: deal entity of that funnel', async () => {
    const { result } = renderHook(() => useFunnelFields('f1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('crm_fields', 'eq', ['entity', 'deal'])).toBe(true);
    expect(has('crm_fields', 'eq', ['funnel_id', 'f1'])).toBe(true);
  });

  it('useDeals(funnelId) filters by funnel', async () => {
    const { result } = renderHook(() => useDeals('f1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('deals', 'eq', ['funnel_id', 'f1'])).toBe(true);
  });

  it('useDealHistory uses or() on record and deal_id', async () => {
    const { result } = renderHook(() => useDealHistory('d1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(has('crm_history', 'or', ['record_id.eq.d1,changes->>deal_id.eq.d1'])).toBe(true);
    expect(has('crm_history', 'limit', [200])).toBe(true);
  });
});
