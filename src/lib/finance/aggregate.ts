import type { BankAccount, FinanceCompany, MonthlyRow, OpenItem, ShareMode, Target } from './types';

export interface CompanySummary {
  companyId: string;
  name: string;
  bank: number | null;
  revenueMonth: number | null;
  targetMonth: number | null;
  targetPct: number | null;
  revenueYtd: number | null;
  revenuePrevYtd: number | null;
  resultYtd: number | null;
  receivables: number;
  overdue: number;
  payables: number;
  health: 'good' | 'warning' | 'critical' | 'unknown';
}

export type GroupSummary = Omit<CompanySummary, 'companyId' | 'name' | 'health'>;

export function applyShare(amount: number, company: Pick<FinanceCompany, 'ownership_pct'>, mode: ShareMode): number {
  return mode === 'share' ? (amount * company.ownership_pct) / 100 : amount;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Samenvatting per bedrijf. Gedrag bij ontbrekende data:
 * - nooit gesynchroniseerd: bank/omzet/YTD/resultaat = null, health 'unknown', items = 0.
 * - gesynchroniseerd maar geen rij voor de maand (of geen bankrekening): null (onbekend, niet 0).
 * Health wordt op de ongedeelde (volledige) bedragen bepaald, los van `mode`.
 */
export function companySummary(
  c: FinanceCompany,
  data: { monthly: MonthlyRow[]; bank: BankAccount[]; items: OpenItem[]; targets: Target[] },
  opts: { month: string; today: string; mode: ShareMode },
): CompanySummary {
  const { month, today, mode } = opts;
  const share = (n: number) => applyShare(n, c, mode);
  const synced = c.last_synced_at !== null;

  const receivableItems = data.items.filter((i) => i.kind === 'receivable');
  const receivablesRaw = sum(receivableItems.map((i) => i.amount));
  const overdueRaw = sum(receivableItems.filter((i) => i.due_date !== null && i.due_date < today).map((i) => i.amount));
  const payablesRaw = sum(data.items.filter((i) => i.kind === 'payable').map((i) => i.amount));

  const targetRow = data.targets.find((t) => t.month === month);
  const targetRaw = targetRow ? targetRow.target : null;

  let bankRaw: number | null = null;
  let revenueMonthRaw: number | null = null;
  let revenueYtdRaw: number | null = null;
  let revenuePrevYtdRaw: number | null = null;
  let resultYtdRaw: number | null = null;

  if (synced) {
    if (data.bank.length > 0) bankRaw = sum(data.bank.map((b) => b.balance));

    const year = Number(month.slice(0, 4));
    const mm = month.slice(5, 7);
    const inYtd = (r: MonthlyRow, y: number) => r.month.slice(0, 4) === String(y) && r.month.slice(5, 7) <= mm;
    const ytd = data.monthly.filter((r) => inYtd(r, year));
    const prev = data.monthly.filter((r) => inYtd(r, year - 1));

    revenueMonthRaw = data.monthly.find((r) => r.month === month)?.revenue ?? null;
    if (ytd.length > 0) {
      revenueYtdRaw = sum(ytd.map((r) => r.revenue));
      resultYtdRaw = sum(ytd.map((r) => r.revenue - r.costs));
    }
    if (prev.length > 0) revenuePrevYtdRaw = sum(prev.map((r) => r.revenue));
  }

  // Verhouding is aandeel-onafhankelijk; target 0 geeft geen zinnige verhouding.
  const targetPct = revenueMonthRaw !== null && targetRaw !== null && targetRaw > 0 ? revenueMonthRaw / targetRaw : null;

  let health: CompanySummary['health'];
  if (c.sync_error) health = 'critical';
  else if (!synced) health = 'unknown';
  else if ((targetPct !== null && targetPct < 0.6) || (bankRaw !== null && bankRaw < c.min_buffer)) health = 'critical';
  else if ((targetPct !== null && targetPct < 0.85) || (receivablesRaw > 0 && overdueRaw > 0.25 * receivablesRaw)) health = 'warning';
  else health = 'good';

  const opt = (n: number | null) => (n === null ? null : share(n));
  return {
    companyId: c.id,
    name: c.name,
    bank: opt(bankRaw),
    revenueMonth: opt(revenueMonthRaw),
    targetMonth: opt(targetRaw),
    targetPct,
    revenueYtd: opt(revenueYtdRaw),
    revenuePrevYtd: opt(revenuePrevYtdRaw),
    resultYtd: opt(resultYtdRaw),
    receivables: share(receivablesRaw),
    overdue: share(overdueRaw),
    payables: share(payablesRaw),
    health,
  };
}

type NullableKey = 'bank' | 'revenueMonth' | 'targetMonth' | 'revenueYtd' | 'revenuePrevYtd' | 'resultYtd';

/** Telt rijen op (aanroeper levert alleen zichtbare, niet-uitgesloten bedrijven). */
export function groupSummary(rows: CompanySummary[]): GroupSummary {
  const total = (key: NullableKey): number | null => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => v !== null);
    return vals.length ? sum(vals) : null;
  };
  const withTarget = rows.filter((r) => r.targetMonth !== null && r.revenueMonth !== null);
  const targetSum = sum(withTarget.map((r) => r.targetMonth as number));
  const revenueSum = sum(withTarget.map((r) => r.revenueMonth as number));
  return {
    bank: total('bank'),
    revenueMonth: total('revenueMonth'),
    targetMonth: total('targetMonth'),
    targetPct: targetSum > 0 ? revenueSum / targetSum : null,
    revenueYtd: total('revenueYtd'),
    revenuePrevYtd: total('revenuePrevYtd'),
    resultYtd: total('resultYtd'),
    receivables: sum(rows.map((r) => r.receivables)),
    overdue: sum(rows.map((r) => r.overdue)),
    payables: sum(rows.map((r) => r.payables)),
  };
}
