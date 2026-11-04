import { format, parseISO, isValid } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { CrmField, DealCrm, Funnel } from './crmTypes';

type DealLike = DealCrm;

// ---------- Formatting ----------

const trimmed = (n: number, max = 2) => {
  const r = Number(n.toFixed(max));
  return r;
};
const decimalsOf = (n: number) => {
  const s = String(trimmed(n));
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
const nlNum = (n: number, decimals: number) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
const full = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

type Unit = 'full' | 'k' | 'mln';
function unitOf(abs: number): Unit {
  if (abs < 10000) return 'full';
  // 999.999 rounds up to 1000k at 2 decimals: promote to mln
  if (abs < 1e6 && trimmed(abs / 1000) < 1000) return 'k';
  return 'mln';
}
const scaled = (abs: number, u: Unit) => (u === 'k' ? abs / 1000 : u === 'mln' ? abs / 1e6 : abs);
const suffix = (u: Unit) => (u === 'k' ? 'k' : u === 'mln' ? ' mln' : '');
const body = (abs: number, u: Unit, minDecimals: number) =>
  u === 'full' ? full(abs) : nlNum(scaled(abs, u), Math.max(decimalsOf(scaled(abs, u)), minDecimals));

export function formatEuroCompact(n: number): string {
  const abs = Math.abs(n);
  const u = unitOf(abs);
  return `${n < 0 ? '-' : ''}€${body(abs, u, 0)}${suffix(u)}`;
}

function formatRange(min: number, max: number): string {
  if (min === max) return formatEuroCompact(min);
  const [a, b] = [Math.abs(min), Math.abs(max)];
  const ua = unitOf(a), ub = unitOf(b);
  if (ua !== ub || min < 0 || max < 0) return `${formatEuroCompact(min)}–${formatEuroCompact(max)}`;
  const anyDec = ua !== 'full' && (decimalsOf(scaled(a, ua)) > 0 || decimalsOf(scaled(b, ub)) > 0);
  const md = anyDec ? 1 : 0;
  if (ua === 'k') return `€${body(a, ua, md)}k–${body(b, ub, md)}k`;
  return `€${body(a, ua, md)}–${body(b, ub, md)}${suffix(ua)}`;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Bounds of a deal's amount in a funnel; value_eur counts as both bounds when min/max are not both set. */
function bounds(deal: DealLike, funnel: Funnel): { min: number; max: number } | null {
  if (funnel.amount_mode === 'none') return null;
  if (funnel.amount_mode === 'fixed') return num(deal.value_eur) ? { min: deal.value_eur, max: deal.value_eur } : null;
  if (num(deal.value_min_eur) && num(deal.value_max_eur)) return { min: deal.value_min_eur, max: deal.value_max_eur };
  if (num(deal.value_eur)) return { min: deal.value_eur, max: deal.value_eur };
  return null;
}

export function formatAmount(deal: DealLike, funnel: Funnel): string | null {
  const b = bounds(deal, funnel);
  if (!b) return null;
  return funnel.amount_mode === 'fixed' ? formatEuroCompact(b.min) : formatRange(b.min, b.max);
}

// ---------- Visibility ----------

export function visibleFields(fields: CrmField[], entity: CrmField['entity'] = 'deal'): CrmField[] {
  return fields
    .filter(f => f.entity === entity && f.enabled && !f.archived_at)
    .sort((a, b) => a.position - b.position);
}

// ---------- Totals ----------

export function funnelTotals(deals: DealLike[], funnel: Funnel, fields: CrmField[]) {
  const withChance = fields.some(f => f.entity === 'deal' && f.key === 'win_chance' && f.enabled && !f.archived_at);
  let min = 0, max = 0;
  let wValue = 0, covered = 0;
  for (const d of deals) {
    const b = bounds(d, funnel);
    if (!b) continue;
    min += b.min; max += b.max;
    if (withChance && num(d.win_chance)) {
      wValue += ((b.min + b.max) / 2) * d.win_chance / 100;
      covered++;
    }
  }
  return {
    count: deals.length,
    amount: funnel.amount_mode === 'none' ? null : { min, max },
    weighted: withChance && funnel.amount_mode !== 'none' ? { value: wValue, covered } : null,
  } as {
    count: number;
    amount: { min: number; max: number } | null;
    weighted: { value: number; covered: number } | null;
  };
}

// ---------- Field values ----------

const BUILTIN_COLUMN: Record<string, keyof DealCrm> = {
  amount: 'value_eur', billing_type: 'billing_type_id', win_chance: 'win_chance', priority: 'priority',
  country: 'country', planned_start: 'planned_start', lead_source: 'lead_source', category: 'category',
  description: 'description',
};

export function fieldValue(deal: DealLike, field: CrmField): unknown {
  if (field.builtin) {
    const col = BUILTIN_COLUMN[field.key];
    return col ? deal[col] : undefined;
  }
  return deal.custom?.[field.id];
}

export function displayValue(field: CrmField, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  switch (field.type) {
    case 'choice': {
      const o = field.options.find(x => x.id === raw);
      return o ? (o.archived ? `${o.label} (gearchiveerd)` : o.label) : null;
    }
    case 'date': {
      const d = parseISO(String(raw));
      return isValid(d) ? format(d, 'd MMM yyyy', { locale: nl }) : null;
    }
    case 'number': {
      if (!num(raw)) return null;
      return field.key === 'win_chance' ? `${raw}%` : raw.toLocaleString('nl-NL');
    }
    case 'money':
      return num(raw) ? formatEuroCompact(raw) : null;
    case 'yes_no':
      return raw === true ? 'Ja' : raw === false ? 'Nee' : null;
    default:
      return String(raw);
  }
}

// ---------- Patch ----------

export function buildDealPatch(
  deal: DealLike, funnel: Funnel, edits: Record<string, unknown>, fields: CrmField[],
): Partial<DealLike> {
  const patch: Record<string, unknown> = {};
  let custom: Record<string, unknown> | null = null;
  const blank = (v: unknown) => (v === '' || v === undefined ? null : v);

  for (const [id, raw] of Object.entries(edits)) {
    const f = fields.find(x => x.id === id);
    if (!f) continue;
    const value = blank(raw);
    if (!f.builtin) {
      custom = custom ?? { ...(deal.custom ?? {}) };
      custom[id] = value;
      continue;
    }
    if (f.key === 'amount') {
      if (funnel.amount_mode === 'fixed') {
        patch.value_eur = value;
      } else if (funnel.amount_mode === 'range') {
        const r = (value ?? {}) as { min?: number | null; max?: number | null };
        const mn = num(r.min) ? r.min : null, mx = num(r.max) ? r.max : null;
        if (mn !== null && mx !== null && mn > mx) throw new Error('Minimum mag niet hoger zijn dan maximum');
        patch.value_min_eur = mn;
        patch.value_max_eur = mx;
        patch.value_eur = mn !== null && mx !== null ? (mn + mx) / 2 : null;
      }
      continue;
    }
    if (f.key === 'win_chance' && value !== null && (!num(value) || value < 0 || value > 100)) {
      throw new Error('Kans moet tussen 0 en 100 liggen');
    }
    const col = BUILTIN_COLUMN[f.key];
    if (col) patch[col] = value;
  }
  if (custom) patch.custom = custom;
  return patch as Partial<DealLike>;
}
