import type { HistoryRow } from '@/hooks/useFunnels';
import type { CrmField, Stage } from './crmTypes';
import { displayValue, formatEuroCompact } from './dealFields';

/** Deal columns behind built-in fields (amount spans three columns). */
const COLUMN_KEY: Record<string, string> = {
  value_eur: 'amount', value_min_eur: 'amount', value_max_eur: 'amount',
  billing_type_id: 'billing_type', win_chance: 'win_chance', priority: 'priority', country: 'country',
  planned_start: 'planned_start', lead_source: 'lead_source', category: 'category', description: 'description',
};
const FIXED_LABEL: Record<string, string> = {
  title: 'Titel', company_id: 'Bedrijf', assigned_to: 'Eigenaar', funnel_id: 'Funnel',
};
/** Columns the DB maintains itself; a change there is never news to the reader. */
const NOISE = new Set([
  'won_at', 'lost_at', 'contact_id', 'deleted_at', 'deleted_by', 'delete_batch', 'updated_at', 'stage_updated_at', 'org_id',
]);
const ACTIVITY: Record<string, string> = {
  note: 'Notitie toegevoegd', call: 'Gesprek gelogd', email: 'E-mail gelogd', meeting: 'Meeting gelogd',
};

type Change = { from: unknown; to: unknown };
const isChange = (v: unknown): v is Change => !!v && typeof v === 'object' && 'from' in v && 'to' in v;
const empty = (v: unknown) => v === null || v === undefined || v === '';

export type ActorNames = Record<string, string>;

/** Names for id columns, so a history line never prints a raw UUID. */
export interface HistoryLookups {
  billingTypes?: Record<string, string>;
  companies?: Record<string, string>;
  people?: Record<string, string>;
}

export function actorName(actor: string | null, names: ActorNames = {}): string {
  if (!actor) return 'Systeem';
  return names[actor] || 'Onbekende gebruiker';
}

function fmt(field: CrmField | undefined, column: string, v: unknown): string {
  if (empty(v)) return 'leeg';
  if (column === 'value_min_eur' || column === 'value_max_eur') return typeof v === 'number' ? formatEuroCompact(v) : String(v);
  if (field) return displayValue(field, v) ?? String(v);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function sentence(who: string, label: string, from: string, to: string, wasEmpty: boolean, nowEmpty: boolean) {
  if (wasEmpty) return `${who} vulde ${label} in: ${to}`;
  if (nowEmpty) return `${who} wiste ${label}`;
  return `${who} wijzigde ${label} van ${from} naar ${to}`;
}

function dealUpdate(
  row: HistoryRow, fields: CrmField[], stages: Stage[], who: string, names: ActorNames, lookups: HistoryLookups,
): string {
  const changes = (row.changes ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const rangeEdit = 'value_min_eur' in changes || 'value_max_eur' in changes;

  for (const [col, raw] of Object.entries(changes)) {
    if (NOISE.has(col) || !isChange(raw)) continue;
    if (col === 'value_eur' && rangeEdit) continue; // the midpoint follows min/max
    if (col === 'stage_id') {
      const name = (id: unknown) => stages.find(s => s.id === id)?.name ?? 'onbekende fase';
      parts.push(`Fase: ${name(raw.from)} → ${name(raw.to)}`);
      continue;
    }
    if (col === 'custom') {
      const from = (raw.from ?? {}) as Record<string, unknown>;
      const to = (raw.to ?? {}) as Record<string, unknown>;
      for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
        if (JSON.stringify(from[id]) === JSON.stringify(to[id])) continue;
        const f = fields.find(x => x.id === id);
        parts.push(sentence(who, f?.label ?? id, fmt(f, id, from[id]), fmt(f, id, to[id]), empty(from[id]), empty(to[id])));
      }
      continue;
    }
    const idLookup = col === 'billing_type_id' ? lookups.billingTypes ?? {}
      : col === 'company_id' ? lookups.companies ?? {}
      : col === 'assigned_to' ? { ...names, ...lookups.people } : null;
    const key = COLUMN_KEY[col];
    const f = key ? fields.find(x => x.builtin && x.key === key) : undefined;
    let label = f?.label ?? FIXED_LABEL[col] ?? col;
    if (col === 'value_min_eur') label = `${label} (minimum)`;
    if (col === 'value_max_eur') label = `${label} (maximum)`;
    const show = (v: unknown) => (idLookup
      ? (empty(v) ? 'leeg' : idLookup[String(v)] || 'onbekend')
      : fmt(f, col, v));
    parts.push(sentence(who, label, show(raw.from), show(raw.to), empty(raw.from), empty(raw.to)));
  }
  return parts.join('. ');
}

/**
 * One Dutch sentence for a crm_history row of a deal (or its contacts, activities and fees).
 * Returns '' for rows that carry nothing worth showing (e.g. the activity mirror of a stage move).
 */
export function historyLine(
  row: HistoryRow, fields: CrmField[], stages: Stage[], names: ActorNames = {}, lookups: HistoryLookups = {},
): string {
  const who = actorName(row.actor, names);
  const changes = (row.changes ?? {}) as Record<string, unknown>;

  switch (row.entity) {
    case 'deals':
      if (row.action === 'insert') return 'Deal aangemaakt';
      if (row.action === 'delete') return 'Deal naar prullenbak verplaatst';
      if (row.action === 'restore') return 'Teruggezet uit prullenbak';
      if (row.action === 'purge') return 'Deal definitief verwijderd';
      return dealUpdate(row, fields, stages, who, names, lookups);
    case 'deal_activities': {
      const type = String(changes.type ?? '');
      if (row.action === 'insert') return type === 'stage_change' ? '' : ACTIVITY[type] ?? 'Activiteit toegevoegd';
      if (row.action === 'delete') return 'Activiteit naar prullenbak verplaatst';
      if (row.action === 'restore') return 'Activiteit teruggezet uit prullenbak';
      return 'Activiteit bijgewerkt';
    }
    case 'deal_contacts': {
      if (row.action === 'insert') return 'Contactpersoon gekoppeld';
      if (row.action === 'delete') return 'Contactpersoon ontkoppeld';
      const p = changes.is_primary;
      if (isChange(p)) return p.to ? 'Primaire contactpersoon gewijzigd' : '';
      return 'Rol van contactpersoon gewijzigd';
    }
    case 'deal_fees':
      if (row.action === 'insert') return 'Tarief toegevoegd';
      if (row.action === 'delete') return 'Tarief verwijderd';
      return 'Tarief gewijzigd';
    default:
      return `${row.entity}: ${row.action}`;
  }
}
