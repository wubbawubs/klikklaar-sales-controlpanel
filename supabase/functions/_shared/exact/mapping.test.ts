import { describe, expect, it } from "vitest";
import {
  latestDateByAccount,
  mapBankAccounts,
  mapMonthly,
  mapOpenItems,
  mapSupplierSpend,
  parseExactDate,
  type ExactGLAccount,
  type ExactListItem,
  type ExactPurchaseEntry,
  type ExactReportingBalance,
} from "./mapping";

// Handgemaakte fixtures in de vorm van Exact Online REST-responses (d.results[]).
const GL_REVENUE = "11111111-0000-0000-0000-000000000110";
const GL_COSTS = "22222222-0000-0000-0000-000000004000";
const GL_ING = "33333333-0000-0000-0000-000000001100";
const GL_RABO = "44444444-0000-0000-0000-000000001110";
const GL_DEBTORS = "55555555-0000-0000-0000-000000001300";

const glAccounts: ExactGLAccount[] = [
  { ID: GL_REVENUE, Code: "8000", Description: "Omzet", Type: 110, BalanceType: "W" },
  { ID: GL_COSTS, Code: "4000", Description: "Huisvestingskosten", Type: 121, BalanceType: "W" },
  { ID: GL_ING, Code: "  1100", Description: "ING zakelijk", Type: 12, BalanceType: "B" },
  { ID: GL_RABO, Code: "1110", Description: "Rabobank", Type: 12, BalanceType: "B" },
  { ID: GL_DEBTORS, Code: "1300", Description: "Debiteuren", Type: 20, BalanceType: "B" },
];
const glTypes = new Map(glAccounts.map((g) => [g.ID, g.Type]));

const rb = (GLAccount: string, BalanceType: string, ReportingPeriod: number, Amount: number): ExactReportingBalance => ({
  GLAccount, BalanceType, ReportingPeriod, ReportingYear: 2026, Amount,
});

describe("parseExactDate", () => {
  it("zet het OData /Date(ms)/-formaat om naar YYYY-MM-DD (UTC)", () => {
    expect(parseExactDate("/Date(1763510400000)/")).toBe("2025-11-19");
  });
  it("accepteert ISO-datums", () => {
    expect(parseExactDate("2026-01-05T00:00:00")).toBe("2026-01-05");
  });
  it("geeft null bij leeg of onleesbaar", () => {
    expect(parseExactDate(null)).toBeNull();
    expect(parseExactDate("")).toBeNull();
    expect(parseExactDate("geen datum")).toBeNull();
  });
});

describe("mapMonthly", () => {
  it("omzet = -Amount van Type 110, kosten = Amount van overige W-rekeningen", () => {
    const rows = [rb(GL_REVENUE, "W", 3, -1000), rb(GL_COSTS, "W", 3, 300)];
    expect(mapMonthly(rows, glTypes, 2026)).toEqual([{ month: "2026-03-01", revenue: 1000, costs: 300 }]);
  });

  it("negeert balansrekeningen (B)", () => {
    const rows = [rb(GL_ING, "B", 3, 5000), rb(GL_DEBTORS, "B", 4, 700), rb(GL_REVENUE, "W", 3, -1000)];
    expect(mapMonthly(rows, glTypes, 2026)).toEqual([{ month: "2026-03-01", revenue: 1000, costs: 0 }]);
  });

  it("telt meerdere rijen per rekening/periode op (kostenplaatsen) en sorteert op maand", () => {
    const rows = [
      rb(GL_COSTS, "W", 11, 100.1),
      rb(GL_REVENUE, "W", 1, -200),
      rb(GL_REVENUE, "W", 1, -50.25),
      rb(GL_COSTS, "W", 11, 0.2),
    ];
    expect(mapMonthly(rows, glTypes, 2025)).toEqual([
      { month: "2025-01-01", revenue: 250.25, costs: 0 },
      { month: "2025-11-01", revenue: 0, costs: 100.3 },
    ]);
  });

  it("negeert perioden buiten 1-12 en telt onbekende W-rekeningen als kosten", () => {
    const rows = [rb(GL_REVENUE, "W", 0, -999), rb(GL_REVENUE, "W", 13, -999), rb("onbekend", "W", 12, 40)];
    expect(mapMonthly(rows, glTypes, 2026)).toEqual([{ month: "2026-12-01", revenue: 0, costs: 40 }]);
  });

  it("creditering op omzet verlaagt de omzet", () => {
    const rows = [rb(GL_REVENUE, "W", 6, -1000), rb(GL_REVENUE, "W", 6, 150)];
    expect(mapMonthly(rows, glTypes, 2026)).toEqual([{ month: "2026-06-01", revenue: 850, costs: 0 }]);
  });
});

describe("mapBankAccounts", () => {
  it("geeft per bankrekening (Type 12) het cumulatieve saldo en de laatste afschriftdatum", () => {
    const balances = [
      rb(GL_ING, "B", 0, 1000), // beginbalans
      rb(GL_ING, "B", 1, 250),
      rb(GL_ING, "B", 2, -50.5),
      rb(GL_DEBTORS, "B", 1, 9999),
      rb(GL_REVENUE, "W", 1, -9999),
    ];
    const lastLines = new Map([[GL_ING, "2026-02-27"]]);
    expect(mapBankAccounts(balances, glAccounts, lastLines)).toEqual([
      { account_code: "1100", name: "ING zakelijk", balance: 1199.5, last_statement_date: "2026-02-27" },
      { account_code: "1110", name: "Rabobank", balance: 0, last_statement_date: null },
    ]);
  });
});

describe("latestDateByAccount", () => {
  it("geeft per grootboekrekening de laatste datum", () => {
    const m = latestDateByAccount([
      { GLAccount: GL_ING, Date: "/Date(1767225600000)/" }, // 2026-01-01
      { GLAccount: GL_ING, Date: "/Date(1772150400000)/" }, // 2026-02-27
      { GLAccount: GL_ING, Date: "/Date(1769904000000)/" }, // 2026-02-01
      { GLAccount: GL_RABO, Date: null },
    ]);
    expect(m.get(GL_ING)).toBe("2026-02-27");
    expect(m.has(GL_RABO)).toBe(false);
  });
});

describe("mapOpenItems", () => {
  const receivables: ExactListItem[] = [
    {
      HID: 1001, AccountCode: "   20001", AccountName: "Bakkerij Jansen", Amount: 1210,
      InvoiceNumber: 26001, InvoiceDate: "/Date(1767225600000)/", DueDate: "/Date(1769904000000)/",
    },
    {
      HID: 1002, AccountCode: "20002", AccountName: null, Amount: -121,
      InvoiceNumber: null, InvoiceDate: null, DueDate: null,
    },
  ];

  it("mapt debiteuren; een creditnota (negatief Amount) blijft negatief", () => {
    expect(mapOpenItems(receivables, "receivable")).toEqual([
      {
        kind: "receivable", exact_id: "1001", invoice_number: "26001", counterparty: "Bakkerij Jansen",
        amount: 1210, invoice_date: "2026-01-01", due_date: "2026-02-01",
      },
      {
        kind: "receivable", exact_id: "1002", invoice_number: null, counterparty: "20002",
        amount: -121, invoice_date: null, due_date: null,
      },
    ]);
  });

  it("mapt crediteuren met positief bedrag", () => {
    const payables: ExactListItem[] = [
      { HID: 7, AccountCode: "60001", AccountName: "KPN", Amount: 89.95, InvoiceNumber: 15, InvoiceDate: null, DueDate: null },
    ];
    expect(mapOpenItems(payables, "payable")).toEqual([
      {
        kind: "payable", exact_id: "7", invoice_number: "15", counterparty: "KPN",
        amount: 89.95, invoice_date: null, due_date: null,
      },
    ]);
  });

  it("valt terug op 'Onbekend' als naam en code ontbreken", () => {
    const [item] = mapOpenItems([{ HID: 9, Amount: 1 }], "payable");
    expect(item.counterparty).toBe("Onbekend");
  });
});

describe("mapSupplierSpend", () => {
  const SUP_KPN = "aaaaaaaa-0000-0000-0000-000000000001";
  const SUP_AWS = "bbbbbbbb-0000-0000-0000-000000000002";
  const entries: ExactPurchaseEntry[] = [
    { EntryID: "e1", Supplier: SUP_KPN, SupplierName: "KPN", EntryDate: "/Date(1767225600000)/", AmountDC: 80 }, // 2026-01-01
    { EntryID: "e2", Supplier: SUP_KPN, SupplierName: "KPN B.V.", EntryDate: "/Date(1772150400000)/", AmountDC: 89.95 }, // 2026-02-27
    { EntryID: "e3", Supplier: SUP_KPN, SupplierName: "KPN", EntryDate: "/Date(1769904000000)/", AmountDC: 85 }, // 2026-02-01
    { EntryID: "e4", Supplier: SUP_AWS, SupplierName: "AWS", EntryDate: "/Date(1769904000000)/", AmountDC: 12.5 },
    { EntryID: "e5", Supplier: null, SupplierName: "Zonder leverancier", EntryDate: "/Date(1769904000000)/", AmountDC: 1 },
  ];

  it("geeft per leverancier de laatste factuur, met leverancierscode uit de lookup", () => {
    const codes = new Map([[SUP_KPN, "   60001"]]);
    expect(mapSupplierSpend(entries, codes)).toEqual([
      { supplier_code: "60001", supplier_name: "KPN B.V.", last_invoice_date: "2026-02-27", last_amount: 89.95 },
      { supplier_code: SUP_AWS, supplier_name: "AWS", last_invoice_date: "2026-02-01", last_amount: 12.5 },
    ]);
  });
});
