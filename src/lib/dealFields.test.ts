import { describe, it, expect } from 'vitest';
import type { CrmField, DealCrm, Funnel } from './crmTypes';
import {
  formatEuroCompact, formatAmount, funnelTotals, fieldValue, displayValue, buildDealPatch, visibleFields,
} from './dealFields';

const funnel = (amount_mode: Funnel['amount_mode']): Funnel => ({
  id: 'f1', org_id: 'o', name: 'F', position: 0, amount_mode, archived_at: null, created_at: '', updated_at: '',
});
const field = (o: Partial<CrmField>): CrmField => ({
  id: 'x', org_id: 'o', entity: 'deal', funnel_id: null, key: 'k', label: 'L', type: 'text', options: [],
  builtin: false, enabled: true, position: 0, archived_at: null, created_at: '', updated_at: '', ...o,
});
const deal = (o: Partial<DealCrm>): DealCrm => ({ value_eur: null, ...o });
const amountF = field({ id: 'a', key: 'amount', builtin: true, type: 'money' });
const chanceF = field({ id: 'w', key: 'win_chance', builtin: true, type: 'number' });

describe('formatEuroCompact', () => {
  it('formats', () => {
    expect(formatEuroCompact(800000)).toBe('€800k');
    expect(formatEuroCompact(150000)).toBe('€150k');
    expect(formatEuroCompact(5000000)).toBe('€5 mln');
    expect(formatEuroCompact(6750000)).toBe('€6,75 mln');
    expect(formatEuroCompact(2500)).toBe('€2.500');
    expect(formatEuroCompact(0)).toBe('€0');
    expect(formatEuroCompact(12500)).toBe('€12,5k');
    expect(formatEuroCompact(999999)).toBe('€1 mln');
  });
});

describe('formatAmount', () => {
  it('fixed', () => {
    expect(formatAmount(deal({ value_eur: 800000 }), funnel('fixed'))).toBe('€800k');
    expect(formatAmount(deal({}), funnel('fixed'))).toBeNull();
  });
  it('range', () => {
    const f = funnel('range');
    expect(formatAmount(deal({ value_min_eur: 5e6, value_max_eur: 10e6 }), f)).toBe('€5–10 mln');
    expect(formatAmount(deal({ value_min_eur: 6.75e6, value_max_eur: 12e6 }), f)).toBe('€6,75–12,0 mln');
    expect(formatAmount(deal({ value_min_eur: 150000, value_max_eur: 400000 }), f)).toBe('€150k–400k');
    expect(formatAmount(deal({ value_min_eur: 5e6, value_max_eur: 5e6 }), f)).toBe('€5 mln');
    expect(formatAmount(deal({ value_min_eur: 800000, value_max_eur: 2e6 }), f)).toBe('€800k–€2 mln');
    expect(formatAmount(deal({ value_min_eur: 5e6 }), f)).toBeNull();
    expect(formatAmount(deal({}), f)).toBeNull();
  });
  it('none', () => {
    expect(formatAmount(deal({ value_eur: 5 }), funnel('none'))).toBeNull();
  });
});

describe('funnelTotals', () => {
  it('fixed with weighted coverage', () => {
    const deals = [
      deal({ value_eur: 1000, win_chance: 50 }),
      deal({ value_eur: 3000, win_chance: 100 }),
      deal({ value_eur: 2000 }),
      deal({ win_chance: 20 }),
    ];
    const t = funnelTotals(deals, funnel('fixed'), [amountF, chanceF]);
    expect(t.count).toBe(4);
    expect(t.amount).toEqual({ min: 6000, max: 6000 });
    expect(t.weighted).toEqual({ value: 3500, covered: 2 });
  });
  it('weighted null when win_chance disabled or absent', () => {
    const d = [deal({ value_eur: 1000, win_chance: 50 })];
    expect(funnelTotals(d, funnel('fixed'), [amountF]).weighted).toBeNull();
    expect(funnelTotals(d, funnel('fixed'), [amountF, { ...chanceF, enabled: false }]).weighted).toBeNull();
  });
  it('range uses midpoint and value_eur fallback', () => {
    const deals = [
      deal({ value_min_eur: 100, value_max_eur: 300, win_chance: 50 }),
      deal({ value_eur: 400, win_chance: 100 }),
      deal({ value_min_eur: 100 }),
    ];
    const t = funnelTotals(deals, funnel('range'), [chanceF]);
    expect(t.amount).toEqual({ min: 500, max: 700 });
    expect(t.weighted).toEqual({ value: 500, covered: 2 });
  });
  it('none has no amount', () => {
    const t = funnelTotals([deal({ value_eur: 10, win_chance: 50 })], funnel('none'), [chanceF]);
    expect(t.count).toBe(1);
    expect(t.amount).toBeNull();
    expect(t.weighted).toBeNull();
  });
});

describe('fieldValue / displayValue', () => {
  it('reads builtin columns and custom', () => {
    expect(fieldValue(deal({ value_eur: 5 }), amountF)).toBe(5);
    expect(fieldValue(deal({ country: 'NL' }), field({ key: 'country', builtin: true }))).toBe('NL');
    expect(fieldValue(deal({ billing_type_id: 'b' }), field({ key: 'billing_type', builtin: true }))).toBe('b');
    expect(fieldValue(deal({ custom: { c1: 'v' } }), field({ id: 'c1' }))).toBe('v');
    expect(fieldValue(deal({}), field({ id: 'c1' }))).toBeUndefined();
  });
  const choice = field({ type: 'choice', options: [
    { id: 'o1', label: 'Hoog', position: 0 }, { id: 'o2', label: 'Oud', position: 1, archived: true },
  ] });
  it('choice and archived label', () => {
    expect(displayValue(choice, 'o1')).toBe('Hoog');
    expect(displayValue(choice, 'o2')).toBe('Oud (gearchiveerd)');
    expect(displayValue(choice, 'zzz')).toBeNull();
  });
  it('other types', () => {
    expect(displayValue(field({ type: 'date' }), '2026-11-04')).toBe('4 nov. 2026');
    expect(displayValue(chanceF, 40)).toBe('40%');
    expect(displayValue(field({ type: 'number' }), 1234)).toBe('1.234');
    expect(displayValue(field({ type: 'yes_no' }), true)).toBe('Ja');
    expect(displayValue(field({ type: 'yes_no' }), false)).toBe('Nee');
    expect(displayValue(field({ type: 'money' }), 800000)).toBe('€800k');
    expect(displayValue(field({ type: 'text' }), '')).toBeNull();
    expect(displayValue(field({ type: 'text' }), null)).toBeNull();
  });
});

describe('buildDealPatch', () => {
  const fields = [
    amountF, chanceF,
    field({ id: 'c', key: 'country', builtin: true }),
    field({ id: 'cu', key: 'custom1' }),
  ];
  it('fixed amount', () => {
    expect(buildDealPatch(deal({}), funnel('fixed'), { a: 1000 }, fields)).toEqual({ value_eur: 1000 });
  });
  it('range amount sets bounds and midpoint', () => {
    expect(buildDealPatch(deal({}), funnel('range'), { a: { min: 100, max: 300 } }, fields))
      .toEqual({ value_min_eur: 100, value_max_eur: 300, value_eur: 200 });
    expect(buildDealPatch(deal({}), funnel('range'), { a: { min: 100, max: null } }, fields))
      .toEqual({ value_min_eur: 100, value_max_eur: null, value_eur: null });
  });
  it('validates', () => {
    expect(() => buildDealPatch(deal({}), funnel('range'), { a: { min: 300, max: 100 } }, fields))
      .toThrow('Minimum mag niet hoger zijn dan maximum');
    expect(() => buildDealPatch(deal({}), funnel('fixed'), { w: 101 }, fields)).toThrow(/0 en 100/);
    expect(() => buildDealPatch(deal({}), funnel('fixed'), { w: -1 }, fields)).toThrow(/0 en 100/);
  });
  it('builtin columns and custom merge', () => {
    expect(buildDealPatch(deal({}), funnel('fixed'), { w: 40, c: 'NL' }, fields)).toEqual({ win_chance: 40, country: 'NL' });
    const p = buildDealPatch(deal({ custom: { keep: 1, cu: 'old' } }), funnel('fixed'), { cu: 'new' }, fields);
    expect(p).toEqual({ custom: { keep: 1, cu: 'new' } });
  });
});

describe('visibleFields', () => {
  it('filters and sorts', () => {
    const fs = [
      field({ id: 'a', position: 2 }), field({ id: 'b', position: 1 }),
      field({ id: 'c', enabled: false }), field({ id: 'd', archived_at: 'x' }),
      field({ id: 'e', entity: 'company' }),
    ];
    expect(visibleFields(fs).map(f => f.id)).toEqual(['b', 'a']);
    expect(visibleFields(fs, 'company').map(f => f.id)).toEqual(['e']);
  });
});
