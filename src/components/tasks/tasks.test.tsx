import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '@/lib/crmTypes';
import { localToday } from '@/lib/tasks';

const update = vi.fn();
const create = vi.fn();
let tasks: Task[] = [];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ isAllView: false }) }));
vi.mock('@/hooks/useBoards', () => ({
  useTeamMembers: () => ({ data: [{ user_id: 'me', full_name: 'Robin Dennie', email: null }] }),
}));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ data: tasks, isLoading: false }),
  useUpdateTask: () => ({ mutate: update, isPending: false }),
  useCreateTask: () => ({ mutate: create, isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useTaskLinkOptions: () => ({ deals: [], companies: [], contacts: [] }),
}));

import TasksPage from '@/pages/TasksPage';
import { TaskRow } from './TaskRow';
import { TaskQuickAdd } from './TaskQuickAdd';

const shift = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days); return localToday(d);
};
const mk = (over: Partial<Task>): Task => ({
  id: 'x', org_id: 'org1', title: 'Taak', notes: null, type: 'todo', priority: 'medium', status: 'open',
  due_date: null, due_time: null, owner_id: 'me', deal_id: null, company_id: null, contact_id: null,
  completed_at: null, completed_by: null, created_by: 'me', created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
  ...over,
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TasksPage', () => {
  beforeEach(() => { update.mockClear(); create.mockClear(); });

  it('groups tasks into the right sections, closed collapsed', () => {
    tasks = [
      mk({ id: 'a', title: 'Te laat', due_date: shift(-2) }),
      mk({ id: 'b', title: 'Nu doen', due_date: shift(0) }),
      mk({ id: 'c', title: 'Later', due_date: shift(3) }),
      mk({ id: 'd', title: 'Ooit' }),
      mk({ id: 'e', title: 'Klaar', status: 'done', completed_at: '2026-11-02T10:00:00Z' }),
    ];
    wrap(<TasksPage />);
    const section = (name: string) => screen.getByRole('region', { name });
    expect(within(section('Achterstallig')).getByText('Te laat')).toBeInTheDocument();
    expect(within(section('Vandaag')).getByText('Nu doen')).toBeInTheDocument();
    expect(within(section('Binnenkort')).getByText('Later')).toBeInTheDocument();
    expect(within(section('Zonder datum')).getByText('Ooit')).toBeInTheDocument();
    expect(screen.queryByText('Klaar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Afgerond/ }));
    expect(screen.getByText('Klaar')).toBeInTheDocument();
  });
});

describe('TaskRow', () => {
  beforeEach(() => update.mockClear());

  it('checking a row sets status done', () => {
    wrap(<TaskRow task={mk({ id: 't1' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Markeer als afgerond' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', patch: { status: 'done' } }), expect.anything());
  });

  it('unchecking a done row reopens it', () => {
    wrap(<TaskRow task={mk({ id: 't2', status: 'done' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Markeer als open' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 't2', patch: { status: 'open' } }), expect.anything());
  });

  it('links a deal chip to the funnel deal panel', () => {
    wrap(<TaskRow task={mk({ deal_id: 'd1', deal: { title: 'Acme deal', funnel_id: 'f1' } })} />);
    expect(screen.getByRole('link', { name: /Acme deal/ })).toHaveAttribute('href', '/pipeline/f1?deal=d1');
  });
});

describe('TaskQuickAdd', () => {
  beforeEach(() => create.mockClear());

  it('creates a task owned by me with the given defaults', () => {
    wrap(<TaskQuickAdd defaults={{ dealId: 'd9' }} />);
    fireEvent.change(screen.getByLabelText('Nieuwe taak'), { target: { value: 'Bel terug' } });
    fireEvent.submit(screen.getByLabelText('Nieuwe taak').closest('form')!);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Bel terug', owner_id: 'me', deal_id: 'd9', type: 'todo', priority: 'medium' }),
      expect.anything(),
    );
  });

  it('does nothing for an empty title', () => {
    wrap(<TaskQuickAdd />);
    fireEvent.submit(screen.getByLabelText('Nieuwe taak').closest('form')!);
    expect(create).not.toHaveBeenCalled();
  });
});
