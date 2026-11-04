import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { localToday } from '@/lib/tasks';

let tasks: any[] = [];
let agenda: any[] = [];
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ data: tasks }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useTaskLinkOptions: () => ({ deals: [], companies: [], contacts: [] }),
}));
vi.mock('@/hooks/useAppointments', () => ({ useAgenda: () => ({ data: agenda }) }));
vi.mock('@/hooks/useBoards', () => ({ useTeamMembers: () => ({ data: [] }) }));

import { TodayCard } from './TodayCard';

const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localToday(d); };
const mk = (id: string, title: string, due: string | null) => ({ id, title, due_date: due, status: 'open', priority: 'medium', type: 'todo',
  owner_id: 'me', created_at: '2026-11-01T10:00:00Z', notes: null, due_time: null, deal_id: null, company_id: null, contact_id: null });
const wrap = () => render(<MemoryRouter><TodayCard /></MemoryRouter>);

describe('TodayCard', () => {
  it('shows empty state', () => {
    tasks = []; agenda = [];
    wrap();
    expect(screen.getByText('Niets meer voor vandaag')).toBeInTheDocument();
  });
  it('shows overdue + today tasks and today appointments only', () => {
    tasks = [mk('1', 'Te laat', shift(-1)), mk('2', 'Vandaag taak', shift(0)), mk('3', 'Morgen taak', shift(1)), mk('4', 'Zonder datum', null)];
    const at = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(14, 0, 0, 0); return d.toISOString(); };
    agenda = [{ id: 'a1', title: 'Call Jan', starts_at: at(0), type: 'call' }, { id: 'a2', title: 'Meeting morgen', starts_at: at(1), type: 'meeting' }];
    wrap();
    expect(screen.getByText('Te laat')).toBeInTheDocument();
    expect(screen.getByText('Vandaag taak')).toBeInTheDocument();
    expect(screen.queryByText('Morgen taak')).not.toBeInTheDocument();
    expect(screen.queryByText('Zonder datum')).not.toBeInTheDocument();
    expect(screen.getByText('Call Jan')).toBeInTheDocument();
    expect(screen.queryByText('Meeting morgen')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alle taken/ })).toHaveAttribute('href', '/taken');
  });
  it('caps tasks at 8', () => {
    tasks = Array.from({ length: 10 }, (_, i) => mk(String(i), `Taak ${i}`, shift(0))); agenda = [];
    wrap();
    expect(screen.getAllByText(/^Taak \d$/)).toHaveLength(8);
  });
});
