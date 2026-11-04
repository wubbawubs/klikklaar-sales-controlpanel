import { describe, it, expect } from 'vitest';
import { hexToHslTriplet, readableOn, DEFAULT_ACCENT } from './color';

describe('color', () => {
  it('converts hex to hsl triplet', () => {
    expect(hexToHslTriplet('#5f9e35')).toBe('96 50% 41%');
    expect(hexToHslTriplet('#0F9B7A')).toBe('166 82% 33%');
    expect(hexToHslTriplet('#ffffff')).toBe('0 0% 100%');
  });
  it('picks readable text color', () => {
    expect(readableOn('#5f9e35')).toBe('#ffffff');
    expect(readableOn('#f5e663')).toBe('#1b2430');
  });
  it('falls back on invalid input', () => {
    expect(hexToHslTriplet('nope')).toBe(hexToHslTriplet(DEFAULT_ACCENT));
    expect(hexToHslTriplet(null)).toBe(hexToHslTriplet(DEFAULT_ACCENT));
    expect(readableOn('zz')).toBe(readableOn(DEFAULT_ACCENT));
  });
});
