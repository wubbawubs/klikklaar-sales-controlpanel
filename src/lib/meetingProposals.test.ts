import { describe, it, expect } from 'vitest';
import { stageKind, proposalBlockers, describeProposal, groupByCompany, isStuck, filterCompanies } from './meetingProposals';

const open = { dealStageName: 'Voorstel', confirmClosed: false };

describe('stageKind', () => {
  it('recognises won and lost stages by name', () => {
    expect(stageKind('Won')).toBe('won');
    expect(stageKind(' gewonnen ')).toBe('won');
    expect(stageKind('Verloren')).toBe('lost');
    expect(stageKind('Voorstel')).toBeNull();
    expect(stageKind(null)).toBeNull();
  });
});

describe('proposalBlockers', () => {
  it('asks only for the time on an otherwise complete appointment', () => {
    expect(proposalBlockers({ kind: 'appointment', company_id: 'c', deal_id: 'd', payload: { date: '2026-11-07', time: null, user_id: 'u' } }, open))
      .toEqual(['Vul tijd in']);
  });

  it('asks for client and deal when unbound', () => {
    const b = proposalBlockers({ kind: 'stage', company_id: null, deal_id: null, payload: { stage_id: 's' } }, { dealStageName: null, confirmClosed: false });
    expect(b).toContain('Kies klant');
    expect(b).toContain('Kies deal');
  });

  it('requires confirmation for a deal that is already won', () => {
    const p = { kind: 'stage' as const, company_id: 'c', deal_id: 'd', payload: { stage_id: 's' } };
    expect(proposalBlockers(p, { dealStageName: 'Won', confirmClosed: false })).toContain('Deal is al gewonnen of verloren — bevestig');
    expect(proposalBlockers(p, { dealStageName: 'Won', confirmClosed: true })).toEqual([]);
  });

  it('accepts a complete new deal without a client or deal', () => {
    expect(proposalBlockers({ kind: 'new_deal', company_id: null, deal_id: null, payload: { company_name: 'X', deal_title: 'SEO', stage_id: 's' } }, open)).toEqual([]);
  });

  it('flags empty notes, missing amounts, owners and stages', () => {
    const base = { company_id: 'c', deal_id: 'd' };
    expect(proposalBlockers({ ...base, kind: 'note', payload: { body: '  ' } }, open)).toEqual(['Notitie is leeg']);
    expect(proposalBlockers({ ...base, kind: 'value', payload: { value_eur: null } }, open)).toEqual(['Vul bedrag in']);
    expect(proposalBlockers({ ...base, kind: 'owner', payload: { user_id: null } }, open)).toEqual(['Kies eigenaar']);
    expect(proposalBlockers({ ...base, kind: 'stage', payload: { stage_id: null } }, open)).toEqual(['Kies fase']);
  });
});

describe('describeProposal', () => {
  const lookups = { stageName: (id: string) => ({ s2: 'Onderhandeling' } as Record<string, string>)[id] ?? null, userName: () => 'Sanne' };
  it('describes changes in plain Dutch', () => {
    expect(describeProposal({ kind: 'stage', payload: { stage_id: 's2' } }, lookups)).toBe('Fase → Onderhandeling');
    expect(describeProposal({ kind: 'lost', payload: { lost_reason: 'te duur' } }, lookups)).toBe('Verloren (te duur)');
    expect(describeProposal({ kind: 'appointment', payload: { date: '2026-11-06', appointment_type: 'call' } }, lookups)).toBe('Opvolging: call op vr 6 november');
  });
});

describe('groupByCompany', () => {
  it('groups by label and keeps first-seen order', () => {
    const g = groupByCompany([{ company_label: 'B', n: 1 }, { company_label: 'A', n: 2 }, { company_label: 'B', n: 3 }]);
    expect(g.map(x => x.label)).toEqual(['B', 'A']);
    expect(g[0].items.map(i => i.n)).toEqual([1, 3]);
  });
});

describe('isStuck', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  it('treats a run older than 5 minutes as stuck', () => {
    expect(isStuck({ status: 'analyzing', started_at: '2026-11-03T11:54:00Z', created_at: '2026-11-03T11:54:00Z' }, now)).toBe(true);
    expect(isStuck({ status: 'analyzing', started_at: '2026-11-03T11:58:00Z', created_at: '2026-11-03T11:50:00Z' }, now)).toBe(false);
    expect(isStuck({ status: 'queued', started_at: null, created_at: '2026-11-03T11:50:00Z' }, now)).toBe(true);
    expect(isStuck({ status: 'ready', started_at: '2026-11-03T10:00:00Z', created_at: '2026-11-03T10:00:00Z' }, now)).toBe(false);
  });
});

describe('filterCompanies', () => {
  const many = Array.from({ length: 1500 }, (_, i) => ({ id: `c${i}`, name: `Bedrijf ${String(i).padStart(4, '0')}` }));
  many.push({ id: 'zw', name: 'Zwaluw Installaties' });
  it('searches the whole list, not just the first rows', () => {
    expect(filterCompanies(many, 'zwaluw', []).map(c => c.id)).toEqual(['zw']);
    expect(filterCompanies(many, 'bedrijf 1499', []).map(c => c.id)).toEqual(['c1499']);
  });
  it('puts candidates first and caps the list', () => {
    const r = filterCompanies(many, '', ['zw']);
    expect(r[0].id).toBe('zw');
    expect(r.length).toBe(50);
  });
});
