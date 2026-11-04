import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiTiles } from './KpiTiles';
import { deals, fields, mkDeal, mkFunnel, stages } from './testFixtures';

describe('KpiTiles', () => {
  it('shows open count, range and weighted value for a range funnel', () => {
    render(<KpiTiles deals={deals} stages={stages} funnel={mkFunnel('range')} fields={fields} />);
    expect(screen.getByText('Open deals')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Open, bandbreedte')).toBeInTheDocument();
    expect(screen.getByText('€6,75–12,0 mln')).toBeInTheDocument();
    expect(screen.getByText('Gewogen')).toBeInTheDocument();
    expect(screen.getByText('€1,32 mln')).toBeInTheDocument();
    expect(screen.getByText('2 van 8 deals')).toBeInTheDocument();
  });

  it('labels a fixed funnel "Open waarde"', () => {
    render(<KpiTiles deals={deals} stages={stages} funnel={mkFunnel('fixed')} fields={fields} />);
    expect(screen.getByText('Open waarde')).toBeInTheDocument();
  });

  it('has no amount tile and no euro sign when mode is none', () => {
    const { container } = render(<KpiTiles deals={deals} stages={stages} funnel={mkFunnel('none')} fields={fields} />);
    expect(screen.queryByText('Open, bandbreedte')).toBeNull();
    expect(screen.queryByText('Open waarde')).toBeNull();
    expect(screen.queryByText('Gewogen')).toBeNull();
    expect(container.textContent).not.toContain('€');
  });

  it('hides the weighted tile when win chance is disabled', () => {
    const off = fields.map(f => (f.key === 'win_chance' ? { ...f, enabled: false } : f));
    render(<KpiTiles deals={deals} stages={stages} funnel={mkFunnel('range')} fields={off} />);
    expect(screen.queryByText('Gewogen')).toBeNull();
  });

  it('shows "–" instead of €0 when no deal has both amount and win chance', () => {
    const none = [mkDeal({ title: 'A', win_chance: 40 }), mkDeal({ title: 'B', value_min_eur: 1e5, value_max_eur: 1e5, value_eur: 1e5 })];
    const { container } = render(<KpiTiles deals={none} stages={stages} funnel={mkFunnel('range')} fields={fields} />);
    expect(screen.getByText('Gewogen')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(container.textContent).not.toContain('€0');
  });
});
