import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CompanyPanel } from './CompanyPanel';

vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
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
  it('shows a link-company state when the deal has no company', () => {
    render(<QueryClientProvider client={new QueryClient()}><CompanyPanel deal={deal} onOpenDeal={() => {}} /></QueryClientProvider>);
    expect(screen.getByText('Koppel een bedrijf')).toBeInTheDocument();
  });

  it('offers Wijzig and Ontkoppel when a company is linked', () => {
    render(<QueryClientProvider client={new QueryClient()}><CompanyPanel deal={{ ...deal, company_id: 'c1' }} onOpenDeal={() => {}} /></QueryClientProvider>);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wijzig' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ontkoppel' })).toBeInTheDocument();
  });
});
