import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrepIntakeTab } from './PrepIntakeTab';

// For the third test, we need to customize the mock for that specific test
let mockSupabaseData: any[] = [];

vi.mock('@/hooks/useOrgId', () => ({ useOrgId: () => 'org1' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: mockSupabaseData, error: null }),
        }),
      }),
    }),
  },
}));
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('PrepIntakeTab', () => {
  it('asks to link a company first when there is none', () => {
    mockSupabaseData = [];
    wrap(<PrepIntakeTab companyId={null} />);
    expect(screen.getByText(/Koppel eerst een bedrijf/)).toBeInTheDocument();
  });
  it('shows only the add button when empty', async () => {
    mockSupabaseData = [];
    wrap(<PrepIntakeTab companyId="c1" />);
    expect(await screen.findByText('+ Voorbereiding of intake toevoegen')).toBeInTheDocument();
  });
  it('shows note item and delete confirmation dialog', async () => {
    mockSupabaseData = [{
      id: 'n1',
      company_id: 'c1',
      item_type: 'note',
      category: 'preparation',
      title: 'Prep',
      body: 'x',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
      file_name: null,
      storage_path: null,
      mime_type: null,
      size_bytes: null,
    }];

    wrap(<PrepIntakeTab companyId="c1" />);

    // Check that the note is displayed under "Voorbereiding"
    expect(await screen.findByText('Prep')).toBeInTheDocument();
    expect(screen.getByText('Voorbereiding')).toBeInTheDocument();

    // Click delete button (aria-label)
    const deleteButton = screen.getByLabelText('Verwijderen');
    fireEvent.click(deleteButton);

    // Check that the confirmation dialog is shown without calling delete
    expect(await screen.findByText('Verwijderen?')).toBeInTheDocument();
  });
});
