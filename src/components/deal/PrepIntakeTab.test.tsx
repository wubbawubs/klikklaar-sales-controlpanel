import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrepIntakeTab } from './PrepIntakeTab';

vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) },
}));
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('PrepIntakeTab', () => {
  it('asks to link a company first when there is none', () => {
    wrap(<PrepIntakeTab companyId={null} />);
    expect(screen.getByText(/Koppel eerst een bedrijf/)).toBeInTheDocument();
  });
  it('shows only the add button when empty', async () => {
    wrap(<PrepIntakeTab companyId="c1" />);
    expect(await screen.findByText('+ Voorbereiding of intake toevoegen')).toBeInTheDocument();
  });
});
