// Exact Online → finance-tabellen. POST { companyId?: string }.
// Toegang: service role (cron), super_admin, of een finance-gebruiker met level 'manage' (alleen
// voor bedrijven die hij mag beheren). Zonder companyId synchroniseren service role/super_admin ook
// de lijst met administraties (nieuwe → finance_companies zonder toegang voor wie dan ook).
// Uitgesloten bedrijven (excluded) worden nooit gesynchroniseerd.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ExactAuthError, ExactNotConnectedError, exactGetAll, getAccessToken } from "../_shared/exact/client.ts";
import {
  type ExactDatedLine,
  type ExactGLAccount,
  type ExactListItem,
  type ExactPurchaseEntry,
  type ExactReportingBalance,
  GL_TYPE_BANK,
  latestDateByAccount,
  mapBankAccounts,
  mapMonthly,
  mapOpenItems,
  mapSupplierSpend,
} from "../_shared/exact/mapping.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const SUPPLIER_SPEND_DAYS = 120;
const BANK_LAST_LINE_DAYS = 120;

type Caller =
  | { kind: "service" }
  | { kind: "super_admin" }
  | { kind: "manage"; uid: string; userClient: SupabaseClient };

interface CompanyRow {
  id: string;
  exact_division: number;
  name: string;
}

async function authorize(req: Request): Promise<Caller | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  if (token === SERVICE_KEY) return { kind: "service" };

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: me, error } = await userClient.rpc("finance_me");
  if (error) return json({ error: "Forbidden" }, 403);
  const row = (Array.isArray(me) ? me[0] : me) as
    | { has_access: boolean; level: string | null; is_super_admin: boolean }
    | undefined;
  if (row?.is_super_admin) return { kind: "super_admin" };
  if (row?.has_access && row.level === "manage") return { kind: "manage", uid: user.id, userClient };
  return json({ error: "Forbidden" }, 403);
}

async function canManage(caller: Caller, companyId: string): Promise<boolean> {
  if (caller.kind !== "manage") return true;
  const { data } = await caller.userClient.rpc("finance_can_manage", { _uid: caller.uid, _company: companyId });
  return data === true;
}

// ── Exact-calls ───────────────────────────────────────────────────────────────────────────────

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Ontdekt de administraties en upsert ze op exact_division. Nieuwe bedrijven krijgen geen toegang. */
async function syncDivisions(token: string): Promise<void> {
  const [me] = await exactGetAll<{ CurrentDivision: number }>(token, "/api/v1/current/Me", {
    query: { $select: "CurrentDivision" },
  });
  if (!me?.CurrentDivision) throw new Error("Exact: geen huidige divisie");
  // hrm/Divisions: alleen administraties waar de ingelogde gebruiker toegang toe heeft.
  // VERIFY tegen echte administratie: hrm/Divisions vs. system/Divisions geeft alle administraties van de koppeling.
  const divisions = await exactGetAll<{ Code: number; Description: string | null; Status: number | null }>(
    token,
    `/api/v1/${me.CurrentDivision}/hrm/Divisions`,
    { query: { $select: "Code,Description,Status" } },
  );
  const rows = divisions
    .filter((d) => d.Code && (d.Status ?? 0) === 0) // 1 = gearchiveerd
    .map((d) => ({ exact_division: d.Code, name: d.Description?.trim() || `Administratie ${d.Code}` }));
  if (rows.length === 0) return;
  // Alleen exact_division + name: bestaande ownership_pct/min_buffer/excluded blijven staan; finance_company_access
  // wordt niet aangeraakt, dus een nieuw bedrijf is voor niemand behalve super_admin zichtbaar.
  const { error } = await admin.from("finance_companies").upsert(rows, { onConflict: "exact_division" });
  if (error) throw new Error(`finance_companies upsert: ${error.message}`);
}

async function syncCompany(token: string, company: CompanyRow): Promise<void> {
  const base = `/api/v1/${company.exact_division}`;
  const now = new Date().toISOString();
  const year = new Date().getUTCFullYear();

  const glAccounts = await exactGetAll<ExactGLAccount>(token, `${base}/financial/GLAccounts`, {
    query: { $select: "ID,Code,Description,Type,BalanceType" },
  });
  const glTypes = new Map(glAccounts.map((g) => [g.ID, g.Type]));

  // Omzet/kosten per maand: vorig en dit jaar. Exact raadt aan alleen op ReportingYear te filteren.
  // VERIFY tegen echte administratie: boekjaar = kalenderjaar (ReportingPeriod 1–12 = jan–dec).
  const balancesByYear = new Map<number, ExactReportingBalance[]>();
  for (const y of [year - 1, year]) {
    const rows = await exactGetAll<ExactReportingBalance>(token, `${base}/financial/ReportingBalance`, {
      query: { $filter: `ReportingYear eq ${y}`, $select: "GLAccount,BalanceType,ReportingPeriod,ReportingYear,Amount" },
    });
    balancesByYear.set(y, rows);
    const monthly = mapMonthly(rows, glTypes, y).map((m) => ({ company_id: company.id, ...m, synced_at: now }));
    if (monthly.length) {
      const { error } = await admin.from("finance_monthly").upsert(monthly, { onConflict: "company_id,month" });
      if (error) throw new Error(`finance_monthly: ${error.message}`);
    }
  }

  // Bank: saldo = som van de ReportingBalance-rijen van dit jaar.
  // VERIFY tegen echte administratie: ReportingPeriod 0 bevat de beginbalans van balansrekeningen, zodat
  // de som over dit jaar het actuele saldo is (anders alleen de mutatie sinds 1 januari).
  const bankGl = glAccounts.filter((g) => g.Type === GL_TYPE_BANK);
  const lastLines = new Map<string, string>();
  for (const g of bankGl) {
    // VERIFY tegen echte administratie: $orderby/$top op financialtransaction/TransactionLines.
    try {
      const lines = await exactGetAll<ExactDatedLine>(token, `${base}/financialtransaction/TransactionLines`, {
        query: {
          $filter: `GLAccount eq guid'${g.ID}' and Date ge datetime'${isoDaysAgo(BANK_LAST_LINE_DAYS)}T00:00:00'`,
          $select: "GLAccount,Date",
          $orderby: "Date desc",
          $top: "1",
        },
        maxRows: 1,
      });
      for (const [k, v] of latestDateByAccount(lines)) lastLines.set(k, v);
    } catch (e) {
      if (e instanceof ExactAuthError) throw e;
      console.error(`exact-sync ${company.exact_division} laatste bankregel ${g.Code}:`, (e as Error).message);
    }
  }
  const bank = mapBankAccounts(balancesByYear.get(year) ?? [], glAccounts, lastLines)
    .map((b) => ({ company_id: company.id, ...b, synced_at: now }));
  if (bank.length) {
    const { error } = await admin.from("finance_bank_accounts").upsert(bank, { onConflict: "company_id,account_code" });
    if (error) throw new Error(`finance_bank_accounts: ${error.message}`);
  }

  // Openstaande posten: alle rijen van dit bedrijf/soort vervangen (upsert, daarna oude weg).
  for (const [kind, endpoint] of [["receivable", "ReceivablesList"], ["payable", "PayablesList"]] as const) {
    const rows = await exactGetAll<ExactListItem>(token, `${base}/read/financial/${endpoint}`, {
      query: { $select: "HID,AccountCode,AccountName,Amount,InvoiceNumber,InvoiceDate,DueDate" },
    });
    // VERIFY tegen echte administratie: teken van Amount in PayablesList (aangenomen: factuur positief).
    const items = [...new Map(mapOpenItems(rows, kind).map((i) => [i.exact_id, i])).values()]
      .map((i) => ({ company_id: company.id, ...i, synced_at: now }));
    if (items.length) {
      const { error } = await admin.from("finance_open_items").upsert(items, { onConflict: "company_id,kind,exact_id" });
      if (error) throw new Error(`finance_open_items: ${error.message}`);
    }
    const stale = await admin.from("finance_open_items").delete()
      .eq("company_id", company.id).eq("kind", kind).lt("synced_at", now);
    if (stale.error) throw new Error(`finance_open_items opschonen: ${stale.error.message}`);
    const unsynced = await admin.from("finance_open_items").delete()
      .eq("company_id", company.id).eq("kind", kind).is("synced_at", null);
    if (unsynced.error) throw new Error(`finance_open_items opschonen: ${unsynced.error.message}`);
  }

  // Inkoop per leverancier (laatste 120 dagen) met leverancierscode uit crm/Accounts.
  const entries = await exactGetAll<ExactPurchaseEntry>(token, `${base}/purchaseentry/PurchaseEntries`, {
    query: {
      $filter: `EntryDate ge datetime'${isoDaysAgo(SUPPLIER_SPEND_DAYS)}T00:00:00'`,
      $select: "EntryID,Supplier,SupplierName,EntryDate,AmountDC",
    },
  });
  if (entries.length) {
    const suppliers = await exactGetAll<{ ID: string; Code: string | null }>(token, `${base}/crm/Accounts`, {
      query: { $filter: "IsSupplier eq true", $select: "ID,Code" },
    });
    const codes = new Map(suppliers.filter((s) => s.Code).map((s) => [s.ID, s.Code as string]));
    const spend = [...new Map(mapSupplierSpend(entries, codes).map((s) => [s.supplier_code, s])).values()]
      .map((s) => ({ company_id: company.id, ...s }));
    const { error } = await admin.from("finance_supplier_spend").upsert(spend, { onConflict: "company_id,supplier_code" });
    if (error) throw new Error(`finance_supplier_spend: ${error.message}`);
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const caller = await authorize(req);
  if (caller instanceof Response) return caller;

  let companyId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.companyId != null) {
      if (typeof body.companyId !== "string") return json({ error: "companyId moet een string zijn" }, 400);
      companyId = body.companyId;
    }
  } catch {
    return json({ error: "Ongeldige body" }, 400);
  }
  if (companyId && !(await canManage(caller, companyId))) return json({ error: "Forbidden" }, 403);

  let token: string;
  try {
    token = await getAccessToken(admin);
  } catch (e) {
    if (e instanceof ExactNotConnectedError) return json({ error: "Exact niet gekoppeld" }, 409);
    if (e instanceof ExactAuthError) return json({ error: "Exact-koppeling verlopen; koppel opnieuw" }, 409);
    console.error("exact-sync token:", (e as Error).message);
    return json({ error: "Interne fout" }, 500);
  }

  try {
    if (!companyId && caller.kind !== "manage") await syncDivisions(token);

    let q = admin.from("finance_companies").select("id, exact_division, name")
      .eq("excluded", false).not("exact_division", "is", null).order("name");
    if (companyId) q = q.eq("id", companyId);
    const { data: companies, error } = await q;
    if (error) throw new Error(`finance_companies: ${error.message}`);

    let list = (companies ?? []) as CompanyRow[];
    if (caller.kind === "manage" && !companyId) {
      const allowed: CompanyRow[] = [];
      for (const c of list) if (await canManage(caller, c.id)) allowed.push(c);
      list = allowed;
    }

    let synced = 0;
    const failed: { companyId: string; error: string }[] = [];
    for (const company of list) {
      try {
        await syncCompany(token, company);
        await admin.from("finance_companies")
          .update({ last_synced_at: new Date().toISOString(), sync_error: null }).eq("id", company.id);
        synced++;
      } catch (e) {
        if (e instanceof ExactAuthError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`exact-sync ${company.exact_division}:`, msg);
        await admin.from("finance_companies").update({ sync_error: msg.slice(0, 500) }).eq("id", company.id);
        failed.push({ companyId: company.id, error: msg });
      }
    }
    return json({ synced, failed });
  } catch (e) {
    if (e instanceof ExactAuthError) return json({ error: "Exact-koppeling verlopen; koppel opnieuw" }, 409);
    console.error("exact-sync:", (e as Error).message);
    return json({ error: "Interne fout" }, 500);
  }
});
