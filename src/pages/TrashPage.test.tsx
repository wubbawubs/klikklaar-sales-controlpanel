import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrashPage from './TrashPage';

const restore = vi.fn();
const purge = vi.fn();
let isOrgAdmin = false;
let orgId: string | null = 'org1';

const items = [{
  entity: 'deals', record_id: 'r1', label: 'Website Unica', deleted_at: '2026-11-04T10:00:00Z',
  deleted_by: 'u1', delete_batch: 'b1', batch_size: 3,
  batch_counts: { deal_activities: 1, crm_appointments: 1, deal_fees: 2 },
}, {
  entity: 'companies', record_id: 'c1', label: 'Bakkerij Jansen', deleted_at: '2026-11-04T09:00:00Z',
  deleted_by: 'u1', delete_batch: 'b2', batch_size: 8,
  batch_counts: { deals: 3, contacts: 2, company_items: 1, deal_activities: 1 },
}];

vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => orgId }));
vi.mock('@/hooks/useTrash', () => ({
  useTrash: () => ({ data: items, isLoading: false }),
  useIsOrgAdmin: () => ({ data: isOrgAdmin }),
  useRestoreBatch: () => ({ mutate: restore, isPending: false }),
  usePurge: () => ({ mutate: purge, isPending: false }),
}));

describe('TrashPage', () => {
  beforeEach(() => { restore.mockClear(); purge.mockClear(); isOrgAdmin = false; orgId = 'org1'; });

  it('lists the trashed item with a restore button', () => {
    render(<TrashPage />);
    expect(screen.getByText('Website Unica')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Terugzetten/ }).length).toBe(2);
  });

  it('shows per row what was deleted together with the item', () => {
    render(<TrashPage />);
    expect(screen.getByText(/samen met 3 deals, 2 contacten, 1 document of notitie, 1 activiteit/)).toBeTruthy();
    expect(screen.getByText(/samen met 1 activiteit, 1 afspraak, 2 tarieven/)).toBeTruthy();
  });

  it('restores the whole batch', () => {
    render(<TrashPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Terugzetten/ })[0]);
    expect(restore).toHaveBeenCalledWith('b1');
  });

  it('hides "Definitief verwijderen" for non-admins', () => {
    render(<TrashPage />);
    expect(screen.queryByRole('button', { name: /Definitief verwijderen/ })).toBeNull();
  });

  it('shows "Definitief verwijderen" for org admins and asks for confirmation before purging', () => {
    isOrgAdmin = true;
    render(<TrashPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Definitief verwijderen/ })[0]);
    expect(purge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Verwijderen$/ }));
    expect(purge).toHaveBeenCalledWith({ entity: 'deals', recordId: 'r1' });
  });

  it('lists in the purge dialog everything a company purge removes for good', () => {
    isOrgAdmin = true;
    render(<TrashPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Definitief verwijderen/ })[1]);
    expect(screen.getByText(/Dit verwijdert definitief: 3 deals, 2 contacten, 1 document of notitie, 1 activiteit/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Verwijderen$/ }));
    expect(purge).toHaveBeenCalledWith({ entity: 'companies', recordId: 'c1' });
  });

  it('asks to pick an organisation in the group view', () => {
    orgId = null;
    render(<TrashPage />);
    expect(screen.getByText(/Kies een organisatie/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Terugzetten/ })).toBeNull();
  });
});
