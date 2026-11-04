import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FunnelTable } from './FunnelTable';
import { fields, mkDeal, mkFunnel, stages } from './testFixtures';

const deals = [
  mkDeal({ id: 'a', title: 'Zonder kans', value_min_eur: 150000, value_max_eur: 400000 }),
  mkDeal({ id: 'b', title: 'Luxemburg', win_chance: 65, custom: { 'cf-woningen': 120 } }),
  mkDeal({ id: 'c', title: 'Stekken', win_chance: 100, value_min_eur: 5e6, value_max_eur: 10e6, company: { name: 'Stekken BV' } }),
];

const renderTable = (o: Partial<Parameters<typeof FunnelTable>[0]> = {}) =>
  render(
    <FunnelTable
      deals={deals} stages={stages} funnel={mkFunnel('range')} fields={fields}
      ownerName={() => null} onOpenDeal={() => {}} {...o}
    />,
  );

const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent?.trim());
const titles = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0]!.textContent);

describe('FunnelTable', () => {
  it('builds its columns from the field config', () => {
    renderTable();
    expect(headers()).toEqual(['Deal', 'Bedrijf', 'Fase', 'Bedrag', 'Winkans', 'Prioriteit', 'Land', 'Aantal woningen', 'Eigenaar']);
    expect(headers()).not.toContain('Bron'); // disabled field
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('sorts by Winkans with empty values last, cycling asc, desc, none', () => {
    renderTable();
    // getByRole with a name computes accessible names for the whole table (slow in jsdom).
    const th = screen.getByText('Winkans').closest('th') as HTMLElement;
    const btn = within(th).getByRole('button');
    expect(th).toHaveAttribute('aria-sort', 'none');

    fireEvent.click(btn);
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    expect(titles()).toEqual(['Luxemburg', 'Stekken', 'Zonder kans']);

    fireEvent.click(btn);
    expect(th).toHaveAttribute('aria-sort', 'descending');
    expect(titles()).toEqual(['Stekken', 'Luxemburg', 'Zonder kans']);

    fireEvent.click(btn);
    expect(th).toHaveAttribute('aria-sort', 'none');
    expect(titles()).toEqual(['Zonder kans', 'Luxemburg', 'Stekken']);
  });

  it('shows ranges in the amount column', () => {
    renderTable();
    expect(screen.getByText('€150k–400k')).toBeInTheDocument();
    expect(screen.getByText('€5–10 mln')).toBeInTheDocument();
  });

  it('has no amount column and no euro sign for mode none', () => {
    const { container } = renderTable({ funnel: mkFunnel('none') });
    expect(headers()).not.toContain('Bedrag');
    expect(container.textContent).not.toContain('€');
  });

  it('opens the deal when a row is clicked', () => {
    const onOpenDeal = vi.fn();
    renderTable({ onOpenDeal });
    fireEvent.click(screen.getByText('Stekken'));
    expect(onOpenDeal).toHaveBeenCalledWith('c');
  });
});

describe('FunnelTable billing type', () => {
  it('shows the billing type name, never its id', () => {
    const billingF = { ...fields[0]!, id: 'billing_type', key: 'billing_type', label: 'Facturatie', type: 'choice' as const, options: [], position: 1 };
    render(
      <FunnelTable
        deals={[mkDeal({ id: 'x', title: 'Met facturatie', billing_type_id: 'bt-uuid-1', billing_type: { name: 'Maandelijks', kind: 'recurring', interval: 'month' } })]}
        stages={stages} funnel={mkFunnel('range')} fields={[billingF]} ownerName={() => null} onOpenDeal={() => {}}
      />,
    );
    expect(screen.getByText('Maandelijks')).toBeInTheDocument();
    expect(screen.queryByText('bt-uuid-1')).toBeNull();
  });
});
