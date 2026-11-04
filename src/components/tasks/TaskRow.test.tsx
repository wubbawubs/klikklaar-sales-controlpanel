import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mutate = vi.fn();
vi.mock('@/hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutate, isPending: false }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useTaskLinkOptions: () => ({ deals: [], companies: [], contacts: [] }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useBoards', () => ({ useTeamMembers: () => ({ data: [] }) }));

import { TaskRow } from './TaskRow';
import type { Task } from '@/lib/crmTypes';

const mk = (p: Record<string, unknown>) => ({ id: 't1', title: 'Bel Jan', due_date: null, status: 'open', priority: 'medium', type: 'todo',
  owner_id: 'me', created_at: '', updated_at: '', notes: null, due_time: null, deal_id: null, company_id: null, contact_id: null, ...p }) as unknown as Task;
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('TaskRow', () => {
  beforeEach(() => mutate.mockClear());
  it('marks an open task done', () => {
    wrap(<TaskRow task={mk({})} />);
    fireEvent.click(screen.getByRole('button', { name: 'Markeer als afgerond' }));
    expect(mutate.mock.calls[0][0]).toEqual({ id: 't1', patch: { status: 'done' } });
  });
  it('reopens a cancelled task instead of marking it done', () => {
    wrap(<TaskRow task={mk({ status: 'cancelled' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Markeer als open' }));
    expect(mutate.mock.calls[0][0]).toEqual({ id: 't1', patch: { status: 'open' } });
  });
  it('labels an unassigned task only when asked', () => {
    const { unmount } = wrap(<TaskRow task={mk({ owner_id: null })} markUnassigned />);
    expect(screen.getByText('Niet toegewezen')).toBeInTheDocument();
    unmount();
    wrap(<TaskRow task={mk({ owner_id: null })} />);
    expect(screen.queryByText('Niet toegewezen')).not.toBeInTheDocument();
  });
});
