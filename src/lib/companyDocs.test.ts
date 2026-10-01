import { describe, it, expect } from 'vitest';
import { companyDocPath, sanitizeFileName, validateDoc, MAX_DOC_BYTES } from './companyDocs';

describe('companyDocs', () => {
  it('sanitizes spaces, umlauts and emoji but keeps the extension', () => {
    expect(sanitizeFileName('Intake Müller 12-10 ✅.pdf')).toBe('Intake_M_ller_12-10__.pdf');
  });

  it('builds org/company scoped paths', () => {
    expect(companyDocPath('org1', 'co1', 'a b.pdf', 'id1')).toBe('org1/co1/id1-a_b.pdf');
  });

  it('rejects files over 20 MB', () => {
    expect(validateDoc({ size: MAX_DOC_BYTES })).toBeNull();
    expect(validateDoc({ size: MAX_DOC_BYTES + 1 })).toBe('Bestand is groter dan 20 MB');
  });
});
