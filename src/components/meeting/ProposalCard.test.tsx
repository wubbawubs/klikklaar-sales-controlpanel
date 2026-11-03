import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProposalCard } from './ProposalCard';
import type { MeetingProposal, ProposalDraft } from '@/hooks/useMeetings';

const stages = [{ id: 's1', name: 'Voorstel', position: 1, color: '#000' }, { id: 's2', name: 'Won', position: 2, color: '#000' }];
const deals = [{ id: 'd1', title: 'Website', company_id: 'c1', stage_id: 's1', value_eur: 1000, assigned_to: 'u1' }];
const companies = [{ id: 'c1', name: 'Bakkerij Jansen' }];
const team = [{ user_id: 'u1', full_name: 'Robin', email: null }];

function proposal(over: Partial<MeetingProposal>): MeetingProposal {
  return {
    id: 'p1', import_id: 'i1', position: 0, kind: 'note', company_id: 'c1', deal_id: 'd1', company_label: 'Bakkerij Jansen',
    candidates: [], payload: { body: 'Twijfelt over prijs' }, expected: null, quote: 'hij twijfelt nog', status: 'open', error: null, ...over,
  };
}
const draftOf = (p: MeetingProposal): ProposalDraft => ({ company_id: p.company_id, deal_id: p.deal_id, payload: p.payload, confirm_closed: false });

function renderCard(p: MeetingProposal, handlers: Partial<{ onApply: () => void }> = {}) {
  return render(
    <ProposalCard proposal={p} draft={draftOf(p)} onDraftChange={vi.fn()} onApply={handlers.onApply ?? vi.fn()}
      onDismiss={vi.fn()} onRestore={vi.fn()} applying={false}
      companies={companies} deals={deals} stages={stages} team={team} />,
  );
}

describe('ProposalCard', () => {
  it('blocks an appointment without a time', () => {
    renderCard(proposal({ kind: 'appointment', payload: { date: '2026-11-06', time: null, user_id: 'u1', appointment_type: 'call' } }));
    expect(screen.getByText('Vul tijd in')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toepassen' })).toBeDisabled();
  });

  it('applies a complete note', () => {
    const onApply = vi.fn();
    renderCard(proposal({}), { onApply });
    expect(screen.getByText(/hij twijfelt nog/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('shows the error and a retry for a failed proposal', () => {
    renderCard(proposal({ status: 'failed', error: 'Deal is sinds de analyse gewijzigd' }));
    expect(screen.getByText(/Deal is sinds de analyse gewijzigd/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opnieuw proberen' })).toBeInTheDocument();
  });

  it('shows applied proposals as done', () => {
    renderCard(proposal({ status: 'applied' }));
    expect(screen.getByText('Toegepast')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toepassen' })).toBeNull();
  });

  it('asks to choose a client when unbound', () => {
    renderCard(proposal({ company_id: null, deal_id: null, company_label: 'Jansen', candidates: ['c1'] }));
    expect(screen.getByText('Kies klant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toepassen' })).toBeDisabled();
  });
});
