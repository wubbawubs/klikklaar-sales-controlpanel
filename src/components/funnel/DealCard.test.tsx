import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DealCard } from './DealCard';
import { fields, mkDeal, mkFunnel } from './testFixtures';

const range = mkFunnel('range');

describe('DealCard', () => {
  it('shows a range amount', () => {
    render(<DealCard deal={mkDeal({ title: 'Parken', value_min_eur: 5e6, value_max_eur: 10e6 })} funnel={range} fields={fields} />);
    expect(screen.getByText('€5–10 mln')).toBeInTheDocument();
  });

  it('shows the win chance as a chip and a meter', () => {
    render(<DealCard deal={mkDeal({ title: 'Lux', win_chance: 65 })} funnel={range} fields={fields} />);
    expect(screen.getByText('65%')).toBeInTheDocument();
    const meter = screen.getByRole('progressbar');
    expect(meter).toHaveAttribute('aria-valuenow', '65');
  });

  it('does not render a disabled field', () => {
    const off = fields.map(f => (f.key === 'win_chance' || f.key === 'country' ? { ...f, enabled: false } : f));
    render(<DealCard deal={mkDeal({ title: 'Lux', win_chance: 65, country: 'Luxemburg', company: { name: 'Acme' } })} funnel={range} fields={off} />);
    expect(screen.queryByText('65%')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText(/Luxemburg/)).toBeNull();
  });

  it('joins company and country in the subtitle when country is enabled', () => {
    render(<DealCard deal={mkDeal({ title: 'Lux', country: 'Luxemburg', company: { name: 'Acme' } })} funnel={range} fields={fields} />);
    expect(screen.getByText('Acme, Luxemburg')).toBeInTheDocument();
  });

  it('shows the priority label and owner initials', () => {
    render(<DealCard deal={mkDeal({ title: 'P', priority: 'p-hoog' })} funnel={range} fields={fields} ownerName="Robin Dennie" />);
    expect(screen.getByText('Hoog')).toBeInTheDocument();
    expect(screen.getByText('RD')).toBeInTheDocument();
  });

  it('renders no euro amount for mode none', () => {
    const { container } = render(
      <DealCard deal={mkDeal({ title: 'X', value_eur: 5000, value_min_eur: 1, value_max_eur: 2 })} funnel={mkFunnel('none')} fields={fields} />,
    );
    expect(container.textContent).not.toContain('€');
  });
});
