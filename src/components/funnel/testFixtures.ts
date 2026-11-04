// Shared test fixtures for the funnel board and list (Buitenbeleving-like "Projecten" funnel).
import type { CrmField, Funnel, Stage } from '@/lib/crmTypes';
import type { Deal } from '@/hooks/usePipeline';

export const mkFunnel = (amount_mode: Funnel['amount_mode'] = 'range'): Funnel => ({
  id: 'f1', org_id: 'o', name: 'Projecten', position: 0, amount_mode, archived_at: null, created_at: '', updated_at: '',
});

export const mkField = (o: Partial<CrmField>): CrmField => ({
  id: o.key ?? 'x', org_id: 'o', entity: 'deal', funnel_id: 'f1', key: 'k', label: 'L', type: 'text', options: [],
  builtin: true, enabled: true, position: 0, archived_at: null, created_at: '', updated_at: '', ...o,
});

export const fields: CrmField[] = [
  mkField({ key: 'amount', label: 'Bedrag', type: 'money', position: 0 }),
  mkField({ key: 'win_chance', label: 'Winkans', type: 'number', position: 2 }),
  mkField({
    key: 'priority', label: 'Prioriteit', type: 'choice', position: 3,
    options: [{ id: 'p-hoog', label: 'Hoog', position: 0 }, { id: 'p-laag', label: 'Laag', position: 1 }],
  }),
  mkField({ key: 'country', label: 'Land', type: 'text', position: 4 }),
  mkField({ key: 'lead_source', label: 'Bron', type: 'text', position: 5, enabled: false }),
  mkField({ id: 'cf-woningen', key: 'aantal_woningen', label: 'Aantal woningen', type: 'number', position: 6, builtin: false }),
];

export const stages: Stage[] = [
  { id: 's-lead', name: 'Lead', position: 0, color: '#5f9e35', funnel_id: 'f1', stage_type: 'open' },
  { id: 's-offerte', name: 'Mondeling toegezegd / bevestigen', position: 1, color: '#3b82f6', funnel_id: 'f1', stage_type: 'open' },
  { id: 's-won', name: 'Gewonnen', position: 2, color: '#16a34a', funnel_id: 'f1', stage_type: 'won' },
  { id: 's-lost', name: 'Verloren', position: 3, color: '#dc2626', funnel_id: 'f1', stage_type: 'lost' },
];

export const mkDeal = (o: Partial<Deal>): Deal => ({
  id: o.title ?? 'd', org_id: 'o', stage_id: 's-lead', title: 'Deal', company_id: null, contact_id: null,
  billing_type_id: null, assigned_to: null, created_at: '', updated_at: '', value_eur: null, ...o,
});

// 8 open deals: €6,75–12,0 mln in total, weighted €1,32 mln over 2 deals (Stekken 100% and Luxemburg 65% of €800k).
export const deals: Deal[] = [
  mkDeal({ title: 'Stekken', value_min_eur: 800000, value_max_eur: 800000, value_eur: 800000, win_chance: 100 }),
  mkDeal({ title: 'Luxemburg', stage_id: 's-offerte', value_min_eur: 800000, value_max_eur: 800000, value_eur: 800000, win_chance: 65 }),
  mkDeal({ title: 'Grote parken België', value_min_eur: 5e6, value_max_eur: 10e6, value_eur: 7.5e6, company: { name: 'Parken BV' } }),
  mkDeal({ title: 'Kleine tuin', value_min_eur: 150000, value_max_eur: 400000, value_eur: 275000 }),
  mkDeal({ title: 'Zonder bedrag A', win_chance: 40 }),
  mkDeal({ title: 'Zonder bedrag B' }),
  mkDeal({ title: 'Zonder bedrag C', stage_id: 's-offerte' }),
  mkDeal({ title: 'Zonder bedrag D', stage_id: 's-offerte' }),
  // Closed deals are not part of the open figures.
  mkDeal({ title: 'Al gewonnen', stage_id: 's-won', value_min_eur: 9e6, value_max_eur: 9e6, value_eur: 9e6, win_chance: 100 }),
  mkDeal({ title: 'Verloren deal', stage_id: 's-lost', value_min_eur: 1e6, value_max_eur: 1e6, value_eur: 1e6, win_chance: 10 }),
];
