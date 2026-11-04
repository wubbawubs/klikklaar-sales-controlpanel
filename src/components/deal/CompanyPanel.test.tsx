import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CompanyPanel } from './CompanyPanel';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useBoards', () => ({ useTeamMembers: () => ({ data: [] }) }));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ data: [] }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
  useTaskLinkOptions: () => ({ deals: [], companies: [], contacts: [] }),
}));

let orgId: string | null = 'org1';
vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => orgId }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) },
}));

vi.mock('@/hooks/useCompanyHub', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useCompanyHub')>();
  return { ...actual, useCompany: (id: string | null) => ({ data: id ? { id, name: 'Acme' } : undefined }) };
});

const deal = { id: 'd1', org_id: 'org1', stage_id: null, title: 'T', value_eur: null, company_id: null, contact_id: null,
  billing_type_id: null, assigned_to: null, created_at: '', updated_at: '' } as any;

describe('CompanyPanel', () => {
  beforeEach(() => { orgId = 'org1'; });
  it('shows a link-company state when the deal has no company', () => {
    render(<QueryClientProvider client={new QueryClient()}><CompanyPanel deal={deal} onOpenDeal={() => {}} /></QueryClientProvider>);
    expect(screen.getByText('Koppel een bedrijf')).toBeInTheDocument();
  });

  it('offers Wijzig and Ontkoppel when a company is linked', () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CompanyPanel deal={{ ...deal, company_id: 'c1' }} onOpenDeal={() => {}} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wijzig' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ontkoppel' })).toBeInTheDocument();
    expect(screen.getByText('Taken')).toBeInTheDocument();
  });

  it('hides the task section in the group view (no org selected)', () => {
    orgId = null;
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CompanyPanel deal={{ ...deal, company_id: 'c1' }} onOpenDeal={() => {}} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Taken')).not.toBeInTheDocument();
  });
});
