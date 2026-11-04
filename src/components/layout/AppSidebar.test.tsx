import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';

let isAllView = false;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn(), isAdmin: true }) }));
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('@/hooks/useOrganization', () => ({
  ALL_ORG_ID: 'all',
  useOrganization: () => ({ current: { id: 'o1', name: 'KK' }, available: [], isAllView, switchTo: vi.fn(), createOrganization: vi.fn() }),
}));
vi.mock('@/hooks/useFunnels', () => ({
  useFunnels: () => ({ data: [{ id: 'f1', name: 'Projecten' }, { id: 'f2', name: 'Partnerschappen' }] }),
}));
vi.mock('@/hooks/usePipeline', () => ({ useDeals: () => ({ data: [{}, {}] }) }));

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppSidebar /></MemoryRouter>);

describe('AppSidebar', () => {
  it('lists funnels linking to /pipeline/<id>', () => {
    isAllView = false;
    renderAt('/');
    expect(screen.getByRole('link', { name: /Projecten/ })).toHaveAttribute('href', '/pipeline/f1');
    expect(screen.getByRole('link', { name: /Partnerschappen/ })).toHaveAttribute('href', '/pipeline/f2');
  });
  it('marks the active funnel with aria-current', () => {
    isAllView = false;
    renderAt('/pipeline/f2');
    expect(screen.getByRole('link', { name: /Partnerschappen/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Projecten/ })).not.toHaveAttribute('aria-current');
  });
  it('hides the Funnels group in the group view', () => {
    isAllView = true;
    renderAt('/');
    expect(screen.queryByText('Funnels')).toBeNull();
    expect(screen.queryByRole('link', { name: /Projecten/ })).toBeNull();
  });
});
