import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealFieldsEditor } from './DealFieldsEditor';
import type { CrmField, Funnel } from '@/lib/crmTypes';
import type { Deal } from '@/hooks/usePipeline';

const mutate = vi.fn();
vi.mock('@/hooks/usePipeline', () => ({
  useUpdateDeal: () => ({ mutate, isPending: false }),
  useBillingTypes: () => ({ data: [] }),
}));

beforeAll(() => {
  // Radix Select needs these in jsdom.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const field = (p: Partial<CrmField>): CrmField => ({
  id: 'f', org_id: 'o', entity: 'deal', funnel_id: 'fn', key: 'k', label: 'L', type: 'text', options: [],
  builtin: false, enabled: true, position: 0, archived_at: null, created_at: '', updated_at: '', ...p,
});
const funnel = (amount_mode: Funnel['amount_mode']): Funnel => ({
  id: 'fn', org_id: 'o', name: 'Sales', position: 0, amount_mode, archived_at: null, created_at: '', updated_at: '',
});
const fields: CrmField[] = [
  field({ id: 'fa', key: 'amount', label: 'Bedrag', type: 'money', builtin: true, position: 0 }),
  field({ id: 'fc', key: 'sector', label: 'Sector', type: 'choice', position: 1, options: [
    { id: 'o1', label: 'Zorg', position: 0 }, { id: 'o2', label: 'Bouw', position: 1 }, { id: 'o3', label: 'Oud', position: 2, archived: true },
  ] }),
];
const deal = (p: Partial<Deal> = {}) => ({
  id: 'd1', org_id: 'o', title: 'Unica', stage_id: 's1', company_id: null, contact_id: null, billing_type_id: null,
  assigned_to: null, created_at: '', updated_at: '', value_eur: null, value_min_eur: null, value_max_eur: null,
  custom: { other: 'keep' }, ...p,
}) as Deal;

describe('DealFieldsEditor', () => {
  beforeEach(() => mutate.mockClear());

  it('saves a range with its midpoint as value_eur', () => {
    render(<DealFieldsEditor deal={deal()} funnel={funnel('range')} fields={fields} />);
    fireEvent.change(screen.getByLabelText('Bedrag minimum'), { target: { value: '150000' } });
    fireEvent.change(screen.getByLabelText('Bedrag maximum'), { target: { value: '400000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ id: 'd1', value_min_eur: 150000, value_max_eur: 400000, value_eur: 275000 });
  });

  it('pre-fills a range from value_eur when min and max are empty', () => {
    render(<DealFieldsEditor deal={deal({ value_eur: 250000 })} funnel={funnel('range')} fields={fields} />);
    expect((screen.getByLabelText('Bedrag minimum') as HTMLInputElement).value).not.toBe('');
    expect((screen.getByLabelText('Bedrag maximum') as HTMLInputElement).value)
      .toBe((screen.getByLabelText('Bedrag minimum') as HTMLInputElement).value);
  });

  it('refuses a minimum above the maximum', () => {
    render(<DealFieldsEditor deal={deal()} funnel={funnel('range')} fields={fields} />);
    fireEvent.change(screen.getByLabelText('Bedrag minimum'), { target: { value: '500000' } });
    fireEvent.change(screen.getByLabelText('Bedrag maximum'), { target: { value: '400000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    expect(screen.getByText('Minimum mag niet hoger zijn dan maximum')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('stores a chosen option id under custom[fieldId], keeping other keys', () => {
    render(<DealFieldsEditor deal={deal({ custom: { other: 'keep', fc: 'o1' } })} funnel={funnel('fixed')} fields={fields} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Sector' }));
    expect(screen.queryByRole('option', { name: /Oud/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Bouw' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    expect(mutate.mock.calls[0][0]).toMatchObject({ id: 'd1', custom: { other: 'keep', fc: 'o2' } });
  });

  it('still shows a current archived option, marked as such', () => {
    render(<DealFieldsEditor deal={deal({ custom: { fc: 'o3' } })} funnel={funnel('fixed')} fields={fields} />);
    expect(screen.getByRole('combobox', { name: 'Sector' })).toHaveTextContent('Oud (gearchiveerd)');
  });

  it('shows no amount control when the funnel has no amounts', () => {
    render(<DealFieldsEditor deal={deal()} funnel={funnel('none')} fields={fields} />);
    expect(screen.queryByText('Bedrag')).toBeNull();
  });
});
