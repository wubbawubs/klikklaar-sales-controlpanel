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
    expect(screen.getByRole('button', { name: /Terugzetten/ })).toBeTruthy();
  });

  it('restores the whole batch', () => {
    render(<TrashPage />);
    fireEvent.click(screen.getByRole('button', { name: /Terugzetten/ }));
    expect(restore).toHaveBeenCalledWith('b1');
  });

  it('hides "Definitief verwijderen" for non-admins', () => {
    render(<TrashPage />);
    expect(screen.queryByRole('button', { name: /Definitief verwijderen/ })).toBeNull();
  });

  it('shows "Definitief verwijderen" for org admins and asks for confirmation before purging', () => {
    isOrgAdmin = true;
    render(<TrashPage />);
    fireEvent.click(screen.getByRole('button', { name: /Definitief verwijderen/ }));
    expect(purge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Verwijderen$/ }));
    expect(purge).toHaveBeenCalledWith({ entity: 'deals', recordId: 'r1' });
  });

  it('asks to pick an organisation in the group view', () => {
    orgId = null;
    render(<TrashPage />);
    expect(screen.getByText(/Kies een organisatie/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Terugzetten/ })).toBeNull();
  });
});
