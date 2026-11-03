import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { stageKind, type ProposalKind, type ProposalPayload } from '../../supabase/functions/_shared/meetingNormalize';

export { stageKind };
export type { ProposalKind, ProposalPayload };

export const KIND_LABEL: Record<ProposalKind, string> = {
  stage: 'Fase', won: 'Gewonnen', lost: 'Verloren', note: 'Notitie', value: 'Waarde',
  owner: 'Eigenaar', appointment: 'Opvolging', new_deal: 'Nieuwe klant',
};

const DEAL_KINDS: ProposalKind[] = ['stage', 'won', 'lost', 'note', 'value', 'owner', 'appointment'];
const blank = (v: unknown) => typeof v !== 'string' || !v.trim();

export const CONFIRM_CLOSED = 'Deal is al gewonnen of verloren — bevestig';

/** What still has to be filled in before a proposal can be applied. Empty = ready. */
export function proposalBlockers(
  p: { kind: ProposalKind; company_id: string | null; deal_id: string | null; payload: ProposalPayload },
  ctx: { dealStageName: string | null; confirmClosed: boolean },
): string[] {
  const out: string[] = [];
  const pl = p.payload ?? {};
  if (DEAL_KINDS.includes(p.kind)) {
    if (!p.company_id) out.push('Kies klant');
    if (!p.deal_id) out.push('Kies deal');
  }
  switch (p.kind) {
    case 'stage': if (!pl.stage_id) out.push('Kies fase'); break;
    case 'value': if (!(typeof pl.value_eur === 'number' && pl.value_eur > 0)) out.push('Vul bedrag in'); break;
    case 'owner': if (!pl.user_id) out.push('Kies eigenaar'); break;
    case 'note': if (blank(pl.body)) out.push('Notitie is leeg'); break;
    case 'appointment':
      if (!pl.date) out.push('Kies datum');
      if (!pl.time) out.push('Vul tijd in');
      if (!pl.user_id) out.push('Kies eigenaar');
      break;
    case 'new_deal':
      if (blank(pl.company_name)) out.push('Vul bedrijfsnaam in');
      if (blank(pl.deal_title)) out.push('Vul dealnaam in');
      if (!pl.stage_id) out.push('Kies fase');
      break;
  }
  if (['stage', 'won', 'lost'].includes(p.kind) && p.deal_id && stageKind(ctx.dealStageName) && !ctx.confirmClosed) {
    out.push(CONFIRM_CLOSED);
  }
  return out;
}

export function describeProposal(
  p: { kind: ProposalKind; payload: ProposalPayload },
  lookups: { stageName: (id: string) => string | null; userName: (id: string) => string | null },
): string {
  const pl = p.payload ?? {};
  switch (p.kind) {
    case 'stage': return `Fase → ${(pl.stage_id && lookups.stageName(pl.stage_id)) || '?'}`;
    case 'won': return 'Gewonnen';
    case 'lost': return pl.lost_reason ? `Verloren (${pl.lost_reason})` : 'Verloren';
    case 'value': return `Waarde → ${pl.value_eur != null ? `€${Number(pl.value_eur).toLocaleString('nl')}` : '?'}`;
    case 'owner': return `Eigenaar → ${(pl.user_id && lookups.userName(pl.user_id)) || '?'}`;
    case 'note': return 'Notitie toevoegen';
    case 'appointment': {
      const when = pl.date ? format(new Date(`${pl.date}T12:00:00`), 'EEEEEE d MMMM', { locale: nl }) : 'datum?';
      return `Opvolging: ${pl.appointment_type === 'meeting' ? 'meeting' : 'call'} op ${when}${pl.time ? ` ${pl.time}` : ''}`;
    }
    case 'new_deal': return `Nieuwe klant + deal: ${pl.deal_title || '?'}`;
  }
}

export function groupByCompany<T extends { company_label: string }>(rows: T[]): { label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const list = groups.get(r.company_label);
    if (list) list.push(r); else groups.set(r.company_label, [r]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

const STUCK_AFTER_MS = 5 * 60 * 1000;

/** A run that has been queued/analyzing for over 5 minutes died (the server allows reclaiming it then). */
export function isStuck(imp: { status: string; started_at: string | null; created_at: string }, now = new Date()): boolean {
  if (imp.status !== 'queued' && imp.status !== 'analyzing') return false;
  return now.getTime() - new Date(imp.started_at ?? imp.created_at).getTime() > STUCK_AFTER_MS;
}

/** Company search for the picker: searches every company, candidates first, at most `limit` results. */
export function filterCompanies<T extends { id: string; name: string }>(companies: T[], query: string, candidates: string[], limit = 50): T[] {
  const q = query.trim().toLowerCase();
  const hits = q ? companies.filter(c => c.name.toLowerCase().includes(q)) : companies;
  const first = hits.filter(c => candidates.includes(c.id));
  return [...first, ...hits.filter(c => !candidates.includes(c.id))].slice(0, limit);
}
