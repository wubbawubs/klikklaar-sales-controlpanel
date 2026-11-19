// Pure mapping van Exact Online REST-responses naar de finance-tabellen. Geen imports, zodat
// deze module zowel in Deno (edge functions) als in vitest draait.
//
// Veldnamen volgen de Exact REST API-referentie (start.exactonline.nl/docs/HlpRestAPIResources.aspx).

/** financial/ReportingBalance: totalen per divisie/jaar/periode/grootboek/kostenplaats/type/status. */
export interface ExactReportingBalance {
  GLAccount: string; // Edm.Guid
  GLAccountCode?: string | null;
  BalanceType: string; // 'B' = balans, 'W' = winst & verlies
  ReportingPeriod: number;
  ReportingYear?: number;
  Amount: number;
}

/** financial/GLAccounts */
export interface ExactGLAccount {
  ID: string; // Edm.Guid
  Code: string;
  Description: string;
  Type: number; // 12 = Bank, 110 = Revenue, ...
  BalanceType?: string | null;
}

/** read/financial/ReceivablesList en read/financial/PayablesList */
export interface ExactListItem {
  HID: number | string;
  AccountCode?: string | null;
  AccountName?: string | null;
  Amount: number;
  InvoiceNumber?: number | string | null;
  InvoiceDate?: string | null;
  DueDate?: string | null;
}

/** purchaseentry/PurchaseEntries */
export interface ExactPurchaseEntry {
  EntryID: string;
  Supplier: string | null; // Edm.Guid van het leveranciersaccount
  SupplierName?: string | null;
  EntryDate: string | null; // factuurdatum
  AmountDC: number; // VERIFY tegen echte administratie: teken bij inkoopcreditnota (Type 31)
}

/** Regel met een datum per grootboekrekening (bijv. financialtransaction/TransactionLines). */
export interface ExactDatedLine {
  GLAccount: string | null;
  Date: string | null;
}

export const GL_TYPE_BANK = 12;
export const GL_TYPE_REVENUE = 110;

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** `/Date(1700000000000)/` (OData v2) of ISO → `YYYY-MM-DD` (UTC); anders null. */
export function parseExactDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const odata = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s);
  if (odata) {
    const d = new Date(Number(odata[1]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(s);
  return iso ? iso[1] : null;
}

/**
 * Omzet en kosten per maand. Alleen W-rekeningen; omzet = −Amount van grootboeken met Type 110,
 * kosten = Amount van alle overige W-rekeningen. Alleen perioden 1–12; maand = `${year}-MM-01`.
 */
export function mapMonthly(
  rows: ExactReportingBalance[],
  glTypes: Map<string, number>,
  year: number,
): { month: string; revenue: number; costs: number }[] {
  const byPeriod = new Map<number, { revenue: number; costs: number }>();
  for (const r of rows) {
    if (r.BalanceType !== "W") continue;
    const p = r.ReportingPeriod;
    if (!Number.isInteger(p) || p < 1 || p > 12) continue;
    const acc = byPeriod.get(p) ?? { revenue: 0, costs: 0 };
    const amount = Number(r.Amount) || 0;
    if (glTypes.get(r.GLAccount) === GL_TYPE_REVENUE) acc.revenue -= amount;
    else acc.costs += amount;
    byPeriod.set(p, acc);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a - b)
    .map(([p, v]) => ({ month: `${year}-${pad2(p)}-01`, revenue: round2(v.revenue) + 0, costs: round2(v.costs) + 0 }));
}

/**
 * Bankrekeningen (grootboek Type 12) met saldo = som van alle meegegeven ReportingBalance-rijen
 * (beginbalans + perioden t/m de laatste) voor die rekening.
 */
export function mapBankAccounts(
  balances: ExactReportingBalance[],
  glAccounts: ExactGLAccount[],
  lastLines: Map<string, string>,
): { account_code: string; name: string; balance: number; last_statement_date: string | null }[] {
  const totals = new Map<string, number>();
  for (const r of balances) totals.set(r.GLAccount, (totals.get(r.GLAccount) ?? 0) + (Number(r.Amount) || 0));
  return glAccounts
    .filter((g) => g.Type === GL_TYPE_BANK)
    .map((g) => ({
      account_code: String(g.Code).trim(),
      name: g.Description,
      balance: round2(totals.get(g.ID) ?? 0) + 0,
      last_statement_date: lastLines.get(g.ID) ?? null,
    }));
}

/** Laatste datum (YYYY-MM-DD) per grootboekrekening. */
export function latestDateByAccount(lines: ExactDatedLine[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of lines) {
    const d = parseExactDate(l.Date);
    if (!l.GLAccount || !d) continue;
    const prev = out.get(l.GLAccount);
    if (!prev || d > prev) out.set(l.GLAccount, d);
  }
  return out;
}

/** Openstaande posten. Bedrag ongewijzigd: facturen positief, creditnota's negatief. */
export function mapOpenItems(
  rows: ExactListItem[],
  kind: "receivable" | "payable",
): {
  kind: "receivable" | "payable";
  exact_id: string;
  invoice_number: string | null;
  counterparty: string;
  amount: number;
  invoice_date: string | null;
  due_date: string | null;
}[] {
  return rows.map((r) => ({
    kind,
    exact_id: String(r.HID),
    invoice_number: r.InvoiceNumber == null ? null : String(r.InvoiceNumber),
    counterparty: r.AccountName?.trim() || r.AccountCode?.trim() || "Onbekend",
    amount: round2(Number(r.Amount) || 0) + 0,
    invoice_date: parseExactDate(r.InvoiceDate),
    due_date: parseExactDate(r.DueDate),
  }));
}

/**
 * Laatste inkoopfactuur per leverancier. `supplierCodes` mapt het leveranciers-ID (Guid) op de
 * leverancierscode uit crm/Accounts; zonder code valt de sleutel terug op het Guid.
 */
export function mapSupplierSpend(
  entries: ExactPurchaseEntry[],
  supplierCodes: Map<string, string> = new Map(),
): { supplier_code: string; supplier_name: string | null; last_invoice_date: string | null; last_amount: number }[] {
  const latest = new Map<string, { entry: ExactPurchaseEntry; date: string | null }>();
  for (const e of entries) {
    if (!e.Supplier) continue;
    const date = parseExactDate(e.EntryDate);
    const prev = latest.get(e.Supplier);
    if (!prev || (date !== null && (prev.date === null || date > prev.date))) latest.set(e.Supplier, { entry: e, date });
  }
  return [...latest.entries()].map(([supplier, { entry, date }]) => ({
    supplier_code: supplierCodes.get(supplier)?.trim() || supplier,
    supplier_name: entry.SupplierName ?? null,
    last_invoice_date: date,
    last_amount: round2(Number(entry.AmountDC) || 0) + 0,
  }));
}
