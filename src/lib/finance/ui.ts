/**
 * Visuele tokens voor de finance-module. Eén plek voor statuskleuren, zodat grafieken,
 * stippen, chips en tekst overal hetzelfde betekenen. Volgt de CRM-thematokens
 * (--success, --primary, --warning, --destructive).
 */

export type Tone = 'success' | 'near' | 'warning' | 'danger' | 'muted';

/** Hexwaarden voor SVG (grafieken) en inline stippen/balken. */
export const TONE_HEX: Record<Tone, string> = {
  success: '#25a87a', // target gehaald, gezond
  near: '#8ccfb8', // 85–100% van target
  warning: '#f2801f',
  danger: '#dc3c3c',
  muted: '#9ca3af', // geen data
};

/** Tekstkleur per toon, met dark-mode variant. */
export const TONE_TEXT: Record<Tone, string> = {
  success: 'text-emerald-700 dark:text-emerald-400',
  near: 'text-emerald-600 dark:text-emerald-300',
  warning: 'text-orange-600 dark:text-orange-400',
  danger: 'text-red-600 dark:text-red-400',
  muted: 'text-muted-foreground',
};

/** Zachte chip-achtergrond + tekst per toon. */
export const TONE_CHIP: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  near: 'bg-emerald-50/60 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  muted: 'bg-muted text-muted-foreground',
};

/** Lichte waarschuwing (1–30 dagen te laat). */
export const CHIP_WARNING_LIGHT = 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';

/** Hoe ver ten opzichte van de target: ≥100% gehaald, 85–100% bijna, 60–85% let op, daaronder slecht. */
export function targetTone(p: number | null): Tone {
  if (p === null) return 'muted';
  if (p >= 1) return 'success';
  if (p >= 0.85) return 'near';
  if (p >= 0.6) return 'warning';
  return 'danger';
}

export const targetColor = (p: number | null): string => TONE_HEX[targetTone(p)];

/** Afgerond percentage, "108%". */
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Gedeelde klassen voor tabellen in finance. */
export const TABLE = {
  table: 'w-full text-[13px]',
  headRow: 'border-b',
  th: 'h-10 px-3 first:pl-5 last:pr-5 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap',
  thNum: 'h-10 px-3 first:pl-5 last:pr-5 text-right align-middle text-xs font-medium text-muted-foreground whitespace-nowrap',
  row: 'h-11 border-b last:border-0',
  td: 'px-3 first:pl-5 last:pr-5 py-2 align-middle',
  tdNum: 'px-3 first:pl-5 last:pr-5 py-2 text-right align-middle tabular-nums whitespace-nowrap',
} as const;

/** Hoogte voor alle bedieningselementen in een rij (header, rapportage). */
export const CONTROL_H = 'h-9';

/** Compacte bedragen voor koppen en assen: "€ 270k". */
export function eurK(n: number): string {
  return `${n < 0 ? '−' : ''}€ ${Math.round(Math.abs(n) / 1000)}k`;
}
