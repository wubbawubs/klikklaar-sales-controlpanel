import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const create = vi.fn();
const task = { id: 't1', org_id: 'o', title: 'Offerte nabellen', notes: null, type: 'todo', priority: 'medium', status: 'open',
  due_date: null, due_time: null, owner_id: 'me', deal_id: 'd1', company_id: null, contact_id: null, completed_at: null,
  completed_by: null, created_by: 'me', created_at: '2026-11-01T10:00:00Z', updated_at: '', deal: { title: 'Deal A', funnel_id: 'f' } };

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useBoards', () => ({ useTeamMembers: () => ({ data: [] }) }));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ data: [task], isLoading: false }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: create, isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useTaskLinkOptions: () => ({ deals: [], companies: [], contacts: [] }),
}));

import { DealTasksTab } from './DealTasksTab';

describe('DealTasksTab', () => {
  it('lists the deal tasks without a deal chip and quick-adds with deal_id', () => {
    render(<MemoryRouter><DealTasksTab dealId="d1" companyId="c1" /></MemoryRouter>);
    expect(screen.getByText('Offerte nabellen')).toBeInTheDocument();
    expect(screen.queryByText('Deal A')).not.toBeInTheDocument();
    const input = screen.getByLabelText('Nieuwe taak');
    fireEvent.change(input, { target: { value: 'Nieuwe taak' } });
    fireEvent.submit(input.closest('form')!);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nieuwe taak', deal_id: 'd1', company_id: 'c1' }), expect.anything());
  });
});
