// Pure logic for turning AI output into meeting proposals. No imports, so it runs in Deno and vitest.
// Rule: never guess. Anything the AI references that we can't verify becomes null and the UI makes the user choose.

export type ProposalKind = 'stage' | 'won' | 'lost' | 'note' | 'value' | 'owner' | 'appointment' | 'new_deal';
export const PROPOSAL_KINDS: ProposalKind[] = ['stage', 'won', 'lost', 'note', 'value', 'owner', 'appointment', 'new_deal'];

export interface ProposalPayload {
  stage_id?: string | null; lost_reason?: string | null; body?: string | null;
  value_eur?: number | null; user_id?: string | null;
  date?: string | null; time?: string | null; appointment_type?: 'call' | 'meeting'; title?: string | null;
  company_name?: string | null; contact_name?: string | null; deal_title?: string | null;
}

export interface Expected { stage_id: string | null; value_eur: number | null; assigned_to: string | null }

export interface ProposalRow {
  position: number; kind: ProposalKind; company_id: string | null; deal_id: string | null;
  company_label: string; candidates: string[]; payload: ProposalPayload;
  expected: Expected | null; quote: string;
}

export interface AiItem {
  kind: ProposalKind; quote: string;
  company_ref: string | null; candidate_company_refs: string[] | null; company_name: string | null;
  deal_ref: string | null; stage_ref: string | null; lost_reason: string | null; body: string | null;
  value_eur: number | null; user_ref: string | null; date: string | null;
  appointment_type: 'call' | 'meeting' | null; title: string | null;
  deal_title: string | null; contact_name: string | null;
}

interface SnapCompany { id: string; name: string }
interface SnapDeal { id: string; title: string; company_id: string | null; stage_id: string | null; value_eur: number | null; assigned_to: string | null }
export type StageType = 'open' | 'won' | 'lost';
interface SnapStage { id: string; name: string; position: number; stage_type?: StageType | null }
interface SnapMember { user_id: string; name: string }

type RefKind = 'company' | 'deal' | 'stage' | 'user';
export interface Snapshot {
  companies: SnapCompany[]; deals: SnapDeal[]; stages: SnapStage[]; members: SnapMember[];
  refOf: Record<RefKind, Record<string, string>>;
  idOf: Record<RefKind, Record<string, string>>;
}

// Accepts a stage (stage_type wins) or a bare name (legacy name rule, used when stage_type is absent).
export function stageKind(stage: { name?: string | null; stage_type?: StageType | null } | string | null | undefined): 'won' | 'lost' | null {
  const st: { name?: string | null; stage_type?: StageType | null } =
    stage != null && typeof stage !== 'string' ? stage : { name: stage as string | null | undefined };
  if (st.stage_type === 'won' || st.stage_type === 'lost') return st.stage_type;
  if (st.stage_type === 'open') return null;
  const n = (st.name ?? '').trim().toLowerCase();
  if (n === 'won' || n === 'gewonnen') return 'won';
  if (n === 'verloren' || n === 'lost') return 'lost';
  return null;
}

export function buildSnapshot(input: { companies: SnapCompany[]; deals: SnapDeal[]; stages: SnapStage[]; members: SnapMember[] }): Snapshot {
  const refOf = { company: {}, deal: {}, stage: {}, user: {} } as Snapshot['refOf'];
  const idOf = { company: {}, deal: {}, stage: {}, user: {} } as Snapshot['idOf'];
  const add = (kind: RefKind, prefix: string, ids: string[]) => ids.forEach((id, i) => {
    const ref = `${prefix}${i + 1}`;
    refOf[kind][id] = ref; idOf[kind][ref] = id;
  });
  const stages = [...input.stages].sort((a, b) => a.position - b.position);
  add('company', 'c', input.companies.map(c => c.id));
  add('deal', 'd', input.deals.map(d => d.id));
  add('stage', 's', stages.map(s => s.id));
  add('user', 'u', input.members.map(m => m.user_id));
  return { ...input, stages, refOf, idOf };
}

export function snapshotPrompt(s: Snapshot): string {
  const stageName = new Map(s.stages.map(st => [st.id, st.name]));
  const lines: string[] = [];
  lines.push('FASES (ref | naam):');
  for (const st of s.stages) lines.push(`${s.refOf.stage[st.id]} | ${st.name}`);
  lines.push('', 'TEAMLEDEN (ref | naam):');
  for (const m of s.members) lines.push(`${s.refOf.user[m.user_id]} | ${m.name}`);
  lines.push('', 'BEDRIJVEN (ref | naam):');
  for (const c of s.companies) lines.push(`${s.refOf.company[c.id]} | ${c.name}`);
  lines.push('', 'DEALS (ref | bedrijf-ref | titel | fase | waarde | eigenaar-ref):');
  for (const d of s.deals) {
    const st = d.stage_id ? `${s.refOf.stage[d.stage_id] ?? '-'} ${stageName.get(d.stage_id) ?? ''}`.trim() : '-';
    const value = d.value_eur != null ? `€${d.value_eur}` : '-';
    const owner = d.assigned_to ? (s.refOf.user[d.assigned_to] ?? '-') : '-';
    const company = d.company_id ? (s.refOf.company[d.company_id] ?? '-') : '-';
    lines.push(`${s.refOf.deal[d.id]} | ${company} | ${d.title} | ${st} | ${value} | ${owner}`);
  }
  return lines.join('\n');
}

function isRealDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function normalizeProposals(ai: AiItem[], s: Snapshot, meetingDate: string): ProposalRow[] {
  const companyById = new Map(s.companies.map(c => [c.id, c]));
  const dealById = new Map(s.deals.map(d => [d.id, d]));
  const stageById = new Map(s.stages.map(st => [st.id, st]));
  const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
  const sameName = new Map<string, string[]>();
  for (const c of s.companies) sameName.set(nameKey(c.name), [...(sameName.get(nameKey(c.name)) ?? []), c.id]);
  const isOpen = (d: SnapDeal) => !stageKind(d.stage_id ? stageById.get(d.stage_id) : null);

  return ai.map((raw, position) => {
    const quote = text(raw.quote) ?? '';
    let kind: ProposalKind = PROPOSAL_KINDS.includes(raw.kind) ? raw.kind : 'note';
    const unknownKind = kind !== raw.kind;

    // Bind to a company/deal only when nothing about the reference is doubtful; otherwise the user chooses.
    let companyId = raw.company_ref ? s.idOf.company[raw.company_ref] ?? null : null;
    const companyInvented = !!raw.company_ref && !companyId;
    let dealId = raw.deal_ref ? s.idOf.deal[raw.deal_ref] ?? null : null;
    let candidates = (raw.candidate_company_refs ?? []).map(r => s.idOf.company[r]).filter((id): id is string => !!id);
    if (kind !== 'new_deal') {
      const dealCompany = dealId ? dealById.get(dealId)?.company_id ?? null : null;
      if (companyId && dealId && dealCompany !== companyId) {
        candidates = [companyId, ...(dealCompany ? [dealCompany] : [])];
        companyId = null;
      } else if (!companyId && dealId && !companyInvented && candidates.length === 0) {
        companyId = dealCompany;
      }
      if (companyId && candidates.some(c => c !== companyId)) {
        candidates = [companyId, ...candidates.filter(c => c !== companyId)];
        companyId = null;
      }
      if (companyId) {
        const twins = sameName.get(nameKey(companyById.get(companyId)!.name)) ?? [];
        if (twins.length > 1) { candidates = twins; companyId = null; }
      }
      if (!companyId) dealId = null;
      if (!dealId && companyId) {
        const open = s.deals.filter(d => d.company_id === companyId && isOpen(d));
        if (open.length === 1) dealId = open[0].id;
      }
    }
    const deal = dealId ? dealById.get(dealId) : undefined;
    const resolvedCompanyId = companyId;
    if (resolvedCompanyId) candidates = [];
    candidates = [...new Set(candidates)];

    const stageId = raw.stage_ref ? s.idOf.stage[raw.stage_ref] ?? null : null;
    const userId = raw.user_ref ? s.idOf.user[raw.user_ref] ?? null : null;
    const value = typeof raw.value_eur === 'number' && isFinite(raw.value_eur) && raw.value_eur > 0 ? raw.value_eur : null;

    const payload: ProposalPayload = {};
    switch (kind) {
      case 'stage': payload.stage_id = stageId; break;
      case 'won': break;
      case 'lost': payload.lost_reason = text(raw.lost_reason); break;
      case 'value': payload.value_eur = value; break;
      case 'owner': payload.user_id = userId; break;
      case 'note': payload.body = unknownKind ? quote : text(raw.body) ?? quote; break;
      case 'appointment':
        payload.date = isRealDate(raw.date) && raw.date > meetingDate ? raw.date : null; // same-day is almost always a misread weekday
        payload.time = null;
        payload.appointment_type = raw.appointment_type === 'meeting' ? 'meeting' : 'call';
        payload.user_id = userId ?? deal?.assigned_to ?? null;
        payload.title = text(raw.title);
        break;
      case 'new_deal':
        payload.company_name = text(raw.company_name);
        payload.deal_title = text(raw.deal_title);
        payload.contact_name = text(raw.contact_name);
        payload.stage_id = stageId;
        payload.value_eur = value;
        payload.body = text(raw.body);
        break;
    }
    if (unknownKind) kind = 'note';

    const company = resolvedCompanyId ? companyById.get(resolvedCompanyId) : undefined;
    return {
      position, kind,
      company_id: kind === 'new_deal' ? null : resolvedCompanyId,
      deal_id: kind === 'new_deal' ? null : dealId,
      company_label: company?.name ?? text(raw.company_name) ?? 'Onbekende klant',
      candidates: kind === 'new_deal' ? [] : candidates,
      payload,
      expected: kind !== 'new_deal' && deal ? { stage_id: deal.stage_id, value_eur: deal.value_eur, assigned_to: deal.assigned_to } : null,
      quote,
    };
  });
}
