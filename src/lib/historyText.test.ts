import { describe, it, expect } from 'vitest';
import { historyLine } from './historyText';
import type { HistoryRow } from '@/hooks/useFunnels';
import type { CrmField, Stage } from './crmTypes';

const field = (p: Partial<CrmField>): CrmField => ({
  id: 'f', org_id: 'o', entity: 'deal', funnel_id: 'fn', key: 'k', label: 'L', type: 'text', options: [],
  builtin: false, enabled: true, position: 0, archived_at: null, created_at: '', updated_at: '', ...p,
});
const fields: CrmField[] = [
  field({ id: 'fw', key: 'win_chance', label: 'Winkans', type: 'number', builtin: true }),
  field({ id: 'fc', key: 'sector', label: 'Sector', type: 'choice',
    options: [{ id: 'o1', label: 'Zorg', position: 0 }, { id: 'o2', label: 'Bouw', position: 1 }] }),
];
const stages: Stage[] = [
  { id: 's1', name: 'Offerte in voorbereiding', position: 0, color: '', funnel_id: 'fn', stage_type: 'open' },
  { id: 's2', name: 'Mondeling toegezegd', position: 1, color: '', funnel_id: 'fn', stage_type: 'open' },
];
const names = { u1: 'Robin' };
const row = (p: Partial<HistoryRow>): HistoryRow => ({
  id: '1', org_id: 'o', entity: 'deals', record_id: 'd1', action: 'update', changes: {}, actor: 'u1', at: '', ...p,
});

describe('historyLine', () => {
  it('names the actor and the field label for a field change', () => {
    expect(historyLine(row({ changes: { win_chance: { from: 50, to: 65 } } }), fields, stages, names))
      .toBe('Robin wijzigde Winkans van 50% naar 65%');
  });

  it('resolves stage names by id', () => {
    expect(historyLine(row({ changes: { stage_id: { from: 's1', to: 's2' }, won_at: { from: null, to: null } } }), fields, stages, names))
      .toBe('Fase: Offerte in voorbereiding → Mondeling toegezegd');
  });

  it('describes a note', () => {
    expect(historyLine(row({ entity: 'deal_activities', action: 'insert', changes: { type: 'note', body: 'x' } }), fields, stages, names))
      .toBe('Notitie toegevoegd');
  });

  it('describes trash and restore', () => {
    expect(historyLine(row({ action: 'delete' }), fields, stages, names)).toBe('Deal naar prullenbak verplaatst');
    expect(historyLine(row({ action: 'restore' }), fields, stages, names)).toBe('Teruggezet uit prullenbak');
  });

  it('reads a null actor as Systeem', () => {
    expect(historyLine(row({ actor: null, changes: { win_chance: { from: 50, to: 65 } } }), fields, stages, names))
      .toBe('Systeem wijzigde Winkans van 50% naar 65%');
  });

  it('uses the column name for unknown columns', () => {
    expect(historyLine(row({ changes: { mystery_col: { from: 'a', to: 'b' } } }), fields, stages, names))
      .toBe('Robin wijzigde mystery_col van a naar b');
  });

  it('labels custom fields from crm_fields and shows option labels', () => {
    expect(historyLine(row({ changes: { custom: { from: { fc: 'o1', x: 1 }, to: { fc: 'o2', x: 1 } } } }), fields, stages, names))
      .toBe('Robin wijzigde Sector van Zorg naar Bouw');
  });

  it('hides the activity mirror of a stage move', () => {
    expect(historyLine(row({ entity: 'deal_activities', action: 'insert', changes: { type: 'stage_change' } }), fields, stages, names)).toBe('');
  });
});
