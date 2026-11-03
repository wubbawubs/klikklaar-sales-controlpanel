import { describe, it, expect } from 'vitest';
import { buildSnapshot, normalizeProposals, snapshotPrompt, type AiItem } from '../../supabase/functions/_shared/meetingNormalize';

const snap = buildSnapshot({
  companies: [
    { id: 'co1', name: 'Bakkerij Jansen' },
    { id: 'co2', name: 'Jansen Installatie' },
    { id: 'co3', name: 'Garage De Vries' },
  ],
  stages: [
    { id: 'st-voorstel', name: 'Voorstel', position: 4 },
    { id: 'st-onder', name: 'Onderhandeling', position: 5 },
    { id: 'st-won', name: 'Won', position: 6 },
    { id: 'st-lost', name: 'Verloren', position: 7 },
  ],
  deals: [
    { id: 'de1', title: 'Website', company_id: 'co1', stage_id: 'st-voorstel', value_eur: 2500, assigned_to: 'user-a' },
    { id: 'de3a', title: 'SEO', company_id: 'co3', stage_id: 'st-voorstel', value_eur: null, assigned_to: 'user-b' },
    { id: 'de3b', title: 'Ads', company_id: 'co3', stage_id: 'st-onder', value_eur: null, assigned_to: 'user-b' },
    { id: 'de3c', title: 'Oud', company_id: 'co3', stage_id: 'st-lost', value_eur: null, assigned_to: 'user-b' },
  ],
  members: [{ user_id: 'user-a', name: 'Robin' }, { user_id: 'user-b', name: 'Sanne' }],
});

const ref = (kind: 'company' | 'deal' | 'stage' | 'user', id: string) => snap.refOf[kind][id];
const item = (over: Partial<AiItem>): AiItem => ({
  kind: 'note', quote: 'q', company_ref: null, candidate_company_refs: [], company_name: null, deal_ref: null,
  stage_ref: null, lost_reason: null, body: null, value_eur: null, user_ref: null, date: null,
  appointment_type: null, title: null, deal_title: null, contact_name: null, ...over,
});

describe('normalizeProposals', () => {
  it('binds the single open deal of a company', () => {
    const [row] = normalizeProposals([item({ kind: 'stage', company_ref: ref('company', 'co1'), stage_ref: ref('stage', 'st-onder') })], snap, '2026-11-03');
    expect(row.company_id).toBe('co1');
    expect(row.deal_id).toBe('de1');
    expect(row.expected).toEqual({ stage_id: 'st-voorstel', value_eur: 2500, assigned_to: 'user-a' });
    expect(row.payload.stage_id).toBe('st-onder');
    expect(row.company_label).toBe('Bakkerij Jansen');
  });

  it('keeps ambiguous company unbound with candidates', () => {
    const [row] = normalizeProposals([item({ company_name: 'Jansen', candidate_company_refs: [ref('company', 'co1'), ref('company', 'co2')] })], snap, '2026-11-03');
    expect(row.company_id).toBeNull();
    expect(row.deal_id).toBeNull();
    expect(row.candidates).toEqual(['co1', 'co2']);
    expect(row.company_label).toBe('Jansen');
  });

  it('leaves deal unbound when a company has two open deals', () => {
    const [row] = normalizeProposals([item({ company_ref: ref('company', 'co3'), body: 'x' })], snap, '2026-11-03');
    expect(row.company_id).toBe('co3');
    expect(row.deal_id).toBeNull();
    expect(row.expected).toBeNull();
  });

  it('leaves company and deal unbound when they conflict', () => {
    const [row] = normalizeProposals([item({ company_ref: ref('company', 'co3'), deal_ref: ref('deal', 'de1') })], snap, '2026-11-03');
    expect(row.company_id).toBeNull();
    expect(row.deal_id).toBeNull();
    expect(row.candidates).toEqual(['co3', 'co1']);
  });

  it('does not bind via a deal when the AI listed candidates', () => {
    const [row] = normalizeProposals([item({ deal_ref: ref('deal', 'de1'), candidate_company_refs: [ref('company', 'co1'), ref('company', 'co2')] })], snap, '2026-11-03');
    expect(row.company_id).toBeNull();
    expect(row.deal_id).toBeNull();
    expect(row.candidates).toEqual(['co1', 'co2']);
  });

  it('does not bind when the company ref is invented, even with a valid deal', () => {
    const [row] = normalizeProposals([item({ company_ref: 'c999', deal_ref: ref('deal', 'de1') })], snap, '2026-11-03');
    expect(row.company_id).toBeNull();
    expect(row.deal_id).toBeNull();
  });

  it('nulls an invented deal ref', () => {
    const [row] = normalizeProposals([item({ company_ref: ref('company', 'co3'), deal_ref: 'd999' })], snap, '2026-11-03');
    expect(row.company_id).toBe('co3');
    expect(row.deal_id).toBeNull();
  });

  it('keeps a company unbound when another company has the same name', () => {
    const dup = buildSnapshot({ ...snap, companies: [...snap.companies, { id: 'co4', name: 'bakkerij  jansen' }] });
    const [row] = normalizeProposals([item({ company_ref: dup.refOf.company.co1 })], dup, '2026-11-03');
    expect(row.company_id).toBeNull();
    expect(row.deal_id).toBeNull();
    expect(row.candidates).toEqual(['co1', 'co4']);
  });

  it('nulls unknown refs', () => {
    const rows = normalizeProposals([
      item({ kind: 'stage', company_ref: 'c999', stage_ref: 's99', company_name: 'Iets' }),
      item({ kind: 'owner', company_ref: ref('company', 'co1'), user_ref: 'u42' }),
    ], snap, '2026-11-03');
    expect(rows).toHaveLength(2);
    expect(rows[0].company_id).toBeNull();
    expect(rows[0].payload.stage_id).toBeNull();
    expect(rows[1].payload.user_id).toBeNull();
  });

  it('nulls appointment dates before the meeting', () => {
    const appt = (date: string) => item({ kind: 'appointment', company_ref: ref('company', 'co1'), date });
    const rows = normalizeProposals([appt('2026-11-13'), appt('2026-11-06'), appt('2026-11-05'), appt('2026-13-01')], snap, '2026-11-06');
    expect(rows.map(r => r.payload.date)).toEqual(['2026-11-13', null, null, null]);
    for (const r of rows) {
      expect(r.payload.time).toBeNull();
      expect(r.payload.user_id).toBe('user-a');
      expect(r.payload.appointment_type).toBe('call');
    }
  });

  it('turns unknown kinds into notes', () => {
    const [row] = normalizeProposals([item({ kind: 'foo' as never, quote: 'x' })], snap, '2026-11-03');
    expect(row.kind).toBe('note');
    expect(row.payload.body).toBe('x');
  });

  it('rejects non-positive values', () => {
    const rows = normalizeProposals([
      item({ kind: 'value', company_ref: ref('company', 'co1'), value_eur: 0 }),
      item({ kind: 'value', company_ref: ref('company', 'co1'), value_eur: -5 }),
      item({ kind: 'value', company_ref: ref('company', 'co1'), value_eur: 1200 }),
    ], snap, '2026-11-03');
    expect(rows.map(r => r.payload.value_eur)).toEqual([null, null, 1200]);
  });

  it('keeps new_deal fields and numbers positions', () => {
    const rows = normalizeProposals([
      item({ body: 'a', company_ref: ref('company', 'co1') }),
      item({ kind: 'new_deal', company_name: 'Nieuw BV', deal_title: 'SEO', stage_ref: ref('stage', 'st-voorstel'), contact_name: 'Piet' }),
    ], snap, '2026-11-03');
    expect(rows.map(r => r.position)).toEqual([0, 1]);
    expect(rows[1].payload).toMatchObject({ company_name: 'Nieuw BV', deal_title: 'SEO', stage_id: 'st-voorstel', contact_name: 'Piet' });
    expect(rows[1].company_label).toBe('Nieuw BV');
  });
});

describe('snapshotPrompt', () => {
  it('lists refs instead of ids', () => {
    const text = snapshotPrompt(snap);
    expect(text).toContain(`${ref('company', 'co1')} | Bakkerij Jansen`);
    expect(text).not.toContain('co1 ');
    expect(text).toContain('Voorstel');
  });
});
