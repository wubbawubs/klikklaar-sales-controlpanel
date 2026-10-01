import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgendaPage from './AgendaPage';

const day = 86400000;
const mk = (id: string, owner: string, offset: number) => ({
  id, owner_id: owner, type: 'call', title: `Afspraak ${id}`, deal_id: 'd1', duration_min: 30,
  starts_at: new Date(Date.now() + offset).toISOString(), company: null, deal: null,
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useAppointments', () => ({
  useAgenda: () => ({ isLoading: false, data: [mk('a', 'me', -2 * day), mk('b', 'other', 20 * day)] }),
}));
vi.mock('@/components/deal/AppointmentsPanel', () => ({ AppointmentActions: () => null, fmtWhen: () => 'wanneer' }));

describe('AgendaPage', () => {
  it('shows group headings and filters on Mijn / Iedereen', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AgendaPage /></MemoryRouter>);
    expect(screen.getByText(/Achterstallig/)).toBeTruthy();
    expect(screen.getByText('Afspraak a')).toBeTruthy();
    expect(screen.queryByText('Afspraak b')).toBeNull();
    fireEvent.click(screen.getByText('Iedereen'));
    expect(screen.getByText('Afspraak b')).toBeTruthy();
    expect(screen.getByText(/Later/)).toBeTruthy();
  });
});
