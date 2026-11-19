import { describe, it, expect } from 'vitest';
import { eur, freshness } from './format';

describe('eur', () => {
  it('formatteert zonder decimalen', () => expect(eur(1234.5)).toBe('€ 1.235'));
  it('formatteert met 2 decimalen', () => expect(eur(1234.5, { decimals: 2 })).toBe('€ 1.234,50'));
  it('toont streepje bij null', () => expect(eur(null)).toBe('—'));
});

describe('freshness', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('is stale na meer dan 26 uur', () => {
    expect(freshness('2026-11-18T09:00:00Z', now).stale).toBe(true);
  });
  it('is vers binnen 26 uur', () => {
    const r = freshness('2026-11-19T08:00:00Z', now);
    expect(r.stale).toBe(false);
    expect(r.label).toContain('geleden');
  });
  it('is stale zonder sync', () => {
    expect(freshness(null, now).stale).toBe(true);
  });
});
