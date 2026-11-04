import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const org = { loading: true, current: null as null | { id: string }, isAllView: false };
const funnelsQuery = { data: undefined as undefined | { id: string; name: string }[], isLoading: false, isPending: true };

vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => org }));
vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => org.current?.id ?? null }));
vi.mock('@/hooks/useFunnels', () => ({
  useFunnels: () => funnelsQuery,
  useFunnel: (id: string) => ({ ...funnelsQuery, data: funnelsQuery.data?.find(f => f.id === id) }),
  useFunnelFields: () => ({ data: [] }),
}));
vi.mock('@/hooks/usePipeline', () => ({
  useDeals: () => ({ data: [], isLoading: false }), useStages: () => ({ data: [] }), useMoveDeal: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useAppointments', () => ({ useAgenda: () => ({ data: [] }) }));
vi.mock('@/hooks/useBoards', () => ({ useTeamMembers: () => ({ data: [] }) }));
vi.mock('./PipelinePage', () => ({ default: () => <div>legacy-board</div> }));
vi.mock('@/components/deal/DealPanel', () => ({ DealPanel: () => null }));
vi.mock('@/components/funnel/FunnelBoard', () => ({ FunnelBoard: () => <div>board</div> }));
vi.mock('@/components/funnel/KpiTiles', () => ({ KpiTiles: () => null }));
vi.mock('@/components/funnel/FunnelTable', () => ({ FunnelTable: () => null }));
vi.mock('@/components/funnel/DealDialogs', () => ({ LeadDialog: () => null, NewDealDialog: () => null }));

import FunnelPage, { PipelineIndex } from './FunnelPage';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}
const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/pipeline" element={<><PipelineIndex /><Where /></>} />
      <Route path="/pipeline/:funnelId" element={<><FunnelPage /><Where /></>} />
    </Routes>
  </MemoryRouter>,
);

describe('FunnelPage cold load', () => {
  beforeEach(() => {
    org.loading = true; org.current = null;
    funnelsQuery.data = undefined; funnelsQuery.isLoading = false; funnelsQuery.isPending = true;
  });

  it('does not redirect a deep link while the organization is still loading', () => {
    renderAt('/pipeline/f2?deal=d9');
    expect(screen.getByTestId('where').textContent).toBe('/pipeline/f2?deal=d9');
  });

  it('PipelineIndex waits for the organization instead of showing the legacy board', () => {
    renderAt('/pipeline?deal=d9');
    expect(screen.queryByText('legacy-board')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/pipeline?deal=d9');
  });

  it('keeps ?deal= when an unknown funnel falls back to /pipeline', () => {
    org.loading = false; org.current = { id: 'o1' };
    funnelsQuery.data = [{ id: 'f1', name: 'Sales' }]; funnelsQuery.isPending = false;
    renderAt('/pipeline/gone?deal=d9');
    expect(screen.getByTestId('where').textContent).toBe('/pipeline/f1?deal=d9');
  });
});
