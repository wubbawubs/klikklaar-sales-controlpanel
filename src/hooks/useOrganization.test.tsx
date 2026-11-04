import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OrganizationProvider, useOrganization, ALL_ORG_ID } from './useOrganization';

let orgs: any[] = [];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, isAdmin: true }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: orgs }) }) }),
    }),
  },
}));

const mk = (id: string, kind: string) => ({
  id, slug: id, name: id, subdomain: null, logo_url: null, primary_color_hex: null,
  accent_color_hex: null, modules: [], active: true, kind,
});

function Probe() {
  const { allOrgIds, available, loading } = useOrganization();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="ids">{allOrgIds.join(',')}</span>
      <span data-testid="algemeen">{available.some(o => o.id === ALL_ORG_ID) ? 'yes' : 'no'}</span>
    </div>
  );
}

async function renderWith(list: any[]) {
  orgs = list;
  const store: Record<string,string> = {};
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  render(<OrganizationProvider><Probe /></OrganizationProvider>);
  await waitFor(() => expect(screen.queryByText('loading')).toBeNull());
}

describe('useOrganization group view', () => {
  it('counts only label orgs and shows Algemeen with two labels', async () => {
    await renderWith([mk('A', 'label'), mk('B', 'label'), mk('C', 'client')]);
    expect(screen.getByTestId('ids').textContent).toBe('A,B');
    expect(screen.getByTestId('algemeen').textContent).toBe('yes');
  });

  it('hides Algemeen with a single label plus a client', async () => {
    await renderWith([mk('A', 'label'), mk('C', 'client')]);
    expect(screen.getByTestId('ids').textContent).toBe('A');
    expect(screen.getByTestId('algemeen').textContent).toBe('no');
  });
});
