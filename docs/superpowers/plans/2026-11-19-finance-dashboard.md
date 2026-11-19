# Finance-dashboard in de CRM — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De rommelige `/finance`-sectie van de CRM vervangen door een finance-module met per-gebruiker/per-bedrijf toegang, cijfers uit Exact Online, en zes pagina's (Overzicht, Omzet & Resultaat, Cash & Liquiditeit, Facturen & Debiteuren, Bedrijven, Rapportage).

**Architecture:** Eigen finance-tabellen in het CRM-Supabase-project met RLS per bedrijf. Twee edge functions (`exact-auth`, `exact-sync`) halen periodiek data uit Exact en upserten die tabellen; de frontend leest alleen uit de tabellen. Rekenwerk (groepstotalen, aandeel-modus, 13-wekenprognose) zit in pure, geteste functies in `src/lib/finance/`. Lokaal bekijken gebeurt op een lokale Supabase-stack met demo-data.

**Tech Stack:** React 18 + Vite + TypeScript, TanStack Query, shadcn/ui, recharts, react-router; Supabase (Postgres + RLS, Deno edge functions); vitest; pg-checks via docker (patroon `supabase/tests/crm_foundation`).

**Spec:** `docs/superpowers/specs/2026-11-19-finance-dashboard-design.md` (+ mockups in `docs/superpowers/specs/2026-11-19-finance-mockups/`).

## Global Constraints

- UI-teksten Nederlands. Bedragen `€ 1.234` (nl-NL, geen decimalen in overzichten; twee decimalen alleen in tabellen met facturen/saldi per rekening).
- Elke migratie begint met `BEGIN;` en eindigt met `COMMIT;` (repo-conventie, zie `supabase/tests/crm_foundation/run.sh`).
- Claude pusht nooit naar productie (`boxmdblzhuyfontwibdj`); migraties en functions rolt Robin uit volgens een ops-doc. Nooit `supabase db push` vanuit de repo-root (zie `docs/ops/2026-11-04-crm-fundament-rollout.md`).
- Branch `feat/finance-dashboard` (worktree `/Users/lp.wubs/Code/klikklaar-finance-dashboard`) moet na elke commit bouwen (`npm run build`) en `npm test` groen houden: gekoppeld aan Lovable.
- `super_admin` ziet altijd alle bedrijven (ook uitgesloten); anderen alleen met finance-vlag + expliciete bedrijfstoegang; uitgesloten bedrijven zijn voor niet-super_admins onzichtbaar.
- Finance-niveaus: `view` en `manage`. Gebruikers- en bedrijfstoegang beheren: alleen `super_admin`.
- `deals`, `deal_fees`, `growth_goals` en `can_view_finance()` (gebruikt door Growth) blijven ongewijzigd.
- Oude finance-tabellen (`invoices`, `cash_positions`, `company_financials`, `contracts`, `bunq_state`) worden in dit plan **niet** gedropt; alleen de code die ze gebruikt verdwijnt. Droppen = latere migratie na check door Robin.
- Groepstotalen: optelsom van zichtbare, niet-uitgesloten bedrijven, met label "excl. intercompany".
- Exact-tokens zijn nooit leesbaar voor clients (tabel zonder policies; alleen service role).

## Review Focus

1. **Gebruiker met finance-vlag maar zonder enige bedrijfstoegang** → ziet lege pagina's met uitleg "Je hebt nog geen toegang tot bedrijven", geen fout, geen groepstotaal van iets. Test in Task 1 (RLS) en Task 6 (lege staat Overzicht).
2. **Bedrijf zonder target voor de maand** → "omzet vs target" toont "geen target" i.p.v. 0% of Infinity; telt niet mee in de groeps-targetpercentage-noemer. Test in Task 3.
3. **Bedrijf dat nooit gesynchroniseerd is of waarvan de sync faalt** → wordt gemarkeerd ("nog niet gesynchroniseerd" / foutmelding), bedragen tonen "—" i.p.v. € 0. Test in Task 3 (`companyHealth`) en Task 6.
4. **Aandeel-modus met ownership 0% of 100%** en **ontbrekend aandeel** → bedragen × pct/100; 0% telt als 0, niet als ontbrekend. Test in Task 3.
5. **Te late debiteuren in de prognose** (vervaldatum in het verleden) → tellen mee in week 1 (keuze, zichtbaar uitgelegd in de UI). Test in Task 3.

---

## File Structure

```
supabase/migrations/20261119000001_finance_access.sql      toegangsmodel + helpers + finance_me()
supabase/migrations/20261119000002_finance_data.sql        data-tabellen, RLS, melding-trigger, exact-connection
supabase/tests/finance/{run.sh,fixtures.sql,checks.sql}    pg-checks (docker)
supabase/seed/finance_demo.sql                             demo-data voor lokaal
supabase/functions/_shared/exact/mapping.ts                pure Exact→rij mapping (geen Deno-imports)
supabase/functions/_shared/exact/mapping.test.ts
supabase/functions/_shared/exact/client.ts                 OAuth-token refresh + rate-limited GET met paging
supabase/functions/exact-auth/index.ts                     OAuth start + callback (super_admin)
supabase/functions/exact-sync/index.ts                     sync alle divisies → upserts
src/lib/finance/types.ts                                   gedeelde TS-types
src/lib/finance/aggregate.ts (+ .test.ts)                  totalen, aandeel-modus, target, health
src/lib/finance/forecast.ts (+ .test.ts)                   13-wekenprognose
src/lib/finance/format.ts (+ .test.ts)                     euro/datum/versheid
src/hooks/useFinance.ts (+ .test.tsx)                      queries + mutations
src/pages/finance/FinanceFilter.tsx                        context: bedrijfsfilter + 100%/aandeel
src/pages/finance/FinanceRoute.tsx                         route guard
src/pages/finance/FinanceLayout.tsx                        (herschreven) tabs + filterbalk
src/pages/finance/{Overzicht,OmzetResultaat,CashLiquiditeit,Debiteuren,Bedrijven,Rapportage}Page.tsx
src/components/finance/{KpiTile,FreshnessBadge,FixedCostDialog,FinanceAccessCell}.tsx
scripts/finance-local.sh                                   lokale stack + schema + migraties + seed
scripts/finance-control-import.mjs (+ src/lib/finance/fcImport.ts + test)  eenmalige overname
docs/ops/2026-11-19-finance-rollout.md                     uitrol + Exact-app + cron
```

Te verwijderen: `src/pages/{FinancePage,FacturenPage,OmzetResultaatPage,LiquiditeitPage,ContractenPage,StripePage,PrognosePage}.tsx`, `src/hooks/{useCash,useFinancials,useContracts,useInvoices}.ts`, `supabase/functions/bunq-sync/`. `stripe-summary` alleen verwijderen als `grep -r stripe-summary src` na het opruimen leeg is.

---

### Task 1: Toegangsmodel (DB) + finance-testharnas

**Files:**
- Create: `supabase/migrations/20261119000001_finance_access.sql`
- Create: `supabase/tests/finance/run.sh`, `supabase/tests/finance/fixtures.sql`, `supabase/tests/finance/checks.sql`

**Interfaces:**
- Produces (tabellen): `finance_companies(id uuid pk default gen_random_uuid(), exact_division int unique null, name text not null, legal_name text, ownership_pct numeric(5,2) not null default 100 check (ownership_pct between 0 and 100), min_buffer numeric not null default 0, excluded boolean not null default false, last_synced_at timestamptz, sync_error text, created_at, updated_at)`; `finance_access(user_id uuid pk references auth.users on delete cascade, level text not null check (level in ('view','manage')), created_at)`; `finance_company_access(user_id uuid references auth.users on delete cascade, company_id uuid references finance_companies on delete cascade, primary key(user_id, company_id))`.
- Produces (SQL, alle `STABLE SECURITY DEFINER SET search_path = public`): `finance_can_view(_uid uuid, _company uuid) returns boolean`, `finance_can_manage(_uid uuid, _company uuid) returns boolean`, `finance_has_access(_uid uuid) returns boolean`, `finance_me() returns table(has_access boolean, level text, is_super_admin boolean)` (super_admin → `(true,'manage',true)`).

- [ ] **Step 1: Harnas** — kopieer `supabase/tests/crm_foundation/run.sh` naar `supabase/tests/finance/run.sh`; wijzig: DIR, de migratie-glob naar `2026110[45]*.sql 20261119*.sql` (de live dump is van 4 nov; de 4/5-nov-migraties staan al in productie), de tabel-check naar `organizations user_roles notifications`, en de slotregel naar `grep -q "FINANCE CHECKS PASSED"`. Hergebruik `crm_foundation/.live_schema.sql` via `SCHEMA=supabase/tests/crm_foundation/.live_schema.sql` (in de worktree ontbreekt die: kopieer hem uit `/Users/lp.wubs/Code/klikklaar-sales-controlpanel/supabase/tests/crm_foundation/.live_schema.sql`; staat in .gitignore — controleer, anders toevoegen).
- [ ] **Step 2: Fixtures** (`fixtures.sql`, na de live schema, vóór de nieuwe migraties alleen auth-users + rollen): users `…f1` super_admin, `…f2` (wordt viewer), `…f3` (wordt manager), `…f4` (geen finance), `…f5` (gewone `admin`, geen finance). Insert in `auth.users(id, email)` en `user_roles`. Bedrijven/toegang komen in checks.sql (tabellen bestaan pas na de migratie): bedrijven A `…c1`, B `…c2`, C `…c3` (excluded=true); `finance_access`: f2 view, f3 manage; `finance_company_access`: f2→A, f3→A, f3→C.
- [ ] **Step 3: Failing checks** in `checks.sql`, elk een `DO`-blok onder login-simulatie (zie crm_foundation checks):
  - f1 ziet 3 bedrijven; f2 ziet alleen A; f3 ziet alleen A (C is excluded); f4 en f5 zien 0.
  - `finance_me()` voor f1 = `(t,'manage',t)`, f2 = `(t,'view',f)`, f4 = `(f,null,f)`.
  - f2 `UPDATE finance_companies SET min_buffer=1 WHERE id=A` raakt 0 rijen; f3 raakt 1 rij; f3 op B raakt 0.
  - f3 `INSERT INTO finance_company_access` → faalt (RLS); f1 → lukt.
  - f2 leest uit `finance_access` alleen zijn eigen rij; f1 leest alle.
  - `can_view_finance(f5)` blijft `true` (Growth ongewijzigd).
  - Slot: `RAISE NOTICE 'FINANCE CHECKS PASSED';`
- [ ] **Step 4:** `bash supabase/tests/finance/run.sh` → FAIL (tabellen bestaan niet).
- [ ] **Step 5: Migratie** schrijven: tabellen, `updated_at`-trigger via bestaande `update_updated_at_column()`, RLS aan. Policies: `finance_companies` SELECT `finance_can_view(auth.uid(), id)`, UPDATE `finance_can_manage(auth.uid(), id)`, INSERT/DELETE `has_role(auth.uid(),'super_admin')`; `finance_access`/`finance_company_access` SELECT `user_id = auth.uid() OR has_role(auth.uid(),'super_admin')`, ALL-write `has_role(auth.uid(),'super_admin')`. `finance_can_view` = super_admin OR (finance_access bestaat AND company_access bestaat AND NOT excluded). `finance_can_manage` = super_admin OR (level='manage' AND company_access AND NOT excluded). `GRANT EXECUTE ON FUNCTION finance_me() TO authenticated`.
- [ ] **Step 6:** `bash supabase/tests/finance/run.sh` → `FINANCE CHECKS PASSED`.
- [ ] **Step 7: Commit** `feat(finance): toegangsmodel per gebruiker en bedrijf`.

### Task 2: Data-tabellen + melding nieuwe maandlast (DB)

**Files:**
- Create: `supabase/migrations/20261119000002_finance_data.sql`
- Modify: `supabase/tests/finance/checks.sql` (blokken toevoegen vóór de slotregel)

**Interfaces:**
- Consumes: Task 1 tabellen/functies.
- Produces (alle met `company_id uuid not null references finance_companies on delete cascade`):
  - `finance_monthly(company_id, month date, revenue numeric not null default 0, costs numeric not null default 0, synced_at timestamptz, primary key(company_id, month))` — `month` = eerste dag van de maand; `costs` positief getal.
  - `finance_bank_accounts(id uuid pk, company_id, account_code text not null, name text not null, balance numeric not null, last_statement_date date, synced_at timestamptz, unique(company_id, account_code))`
  - `finance_open_items(id uuid pk, company_id, kind text check (kind in ('receivable','payable')), exact_id text not null, invoice_number text, counterparty text not null, amount numeric not null, invoice_date date, due_date date, synced_at timestamptz, unique(company_id, kind, exact_id))`
  - `finance_supplier_spend(company_id, supplier_code text, supplier_name text, last_invoice_date date, last_amount numeric, primary key(company_id, supplier_code))`
  - `finance_targets(company_id, month date, target numeric not null check (target >= 0), primary key(company_id, month))`
  - `finance_fixed_costs(id uuid pk, company_id, name text not null, category text not null check (category in ('personeel','huisvesting','software','marketing','verzekeringen','advies','overig')), monthly_amount numeric not null check (monthly_amount >= 0), exact_supplier_code text, active boolean not null default true, created_by uuid references auth.users, created_at, updated_at)`
  - `finance_exact_connection(id int pk check (id = 1), access_token text, refresh_token text, expires_at timestamptz, connected_by uuid, connected_at timestamptz)` — RLS aan, **geen** policies.
  - Trigger `finance_notify_new_fixed_cost()` AFTER INSERT op `finance_fixed_costs`.

- [ ] **Step 1: Failing checks** toevoegen:
  - f2 ziet in `finance_open_items`/`finance_monthly`/`finance_bank_accounts` alleen rijen van A (seed in checks: rijen voor A en B).
  - f2 INSERT `finance_fixed_costs` voor A → faalt; f3 → lukt; f3 voor B → faalt.
  - f2 INSERT `finance_targets` → faalt; f3 voor A → lukt.
  - Authenticated INSERT in `finance_monthly` / `finance_open_items` → faalt (alleen service role schrijft).
  - `finance_exact_connection` SELECT als f1 → 0 rijen (ook als er een rij staat).
  - Na f3-insert van maandlast "HubSpot Sales Pro" € 450 voor A: `notifications` heeft precies één rij voor f1 en één voor f2, geen voor f3 (maker), f4, f5; title `Nieuwe maandlast`, body `<full_name of e-mail f3> heeft een nieuwe maandlast toegevoegd: HubSpot Sales Pro, € 450 p/m.`, action_url `/finance/liquiditeit`.
- [ ] **Step 2:** run.sh → FAIL.
- [ ] **Step 3: Migratie**: tabellen + RLS. SELECT op alle data-tabellen: `finance_can_view(auth.uid(), company_id)`. Write op `finance_targets`/`finance_fixed_costs`: `finance_can_manage(auth.uid(), company_id)` (USING + WITH CHECK). Synced tabellen: alleen SELECT-policy. Trigger (SECURITY DEFINER): ontvangers = super_admins ∪ (finance_access ⋈ finance_company_access op NEW.company_id), minus `NEW.created_by`; naam uit `profiles.full_name`, fallback `profiles.email`; bedrag via `to_char(NEW.monthly_amount,'FM999G999G990', 'NLS_NUMERIC_CHARACTERS='',.''')` → "450". `created_by` default `auth.uid()`.
- [ ] **Step 4:** run.sh → PASSED.
- [ ] **Step 5: Commit** `feat(finance): data-tabellen en melding bij nieuwe maandlast`.

### Task 3: Rekenlaag (pure functies)

**Files:**
- Create: `src/lib/finance/types.ts`, `src/lib/finance/aggregate.ts`, `src/lib/finance/forecast.ts`, `src/lib/finance/format.ts` + `.test.ts` voor de laatste drie

**Interfaces:**
- Produces in `types.ts`: `FinanceCompany`, `MonthlyRow`, `BankAccount`, `OpenItem`, `Target`, `FixedCost`, `SupplierSpend` (velden 1-op-1 de kolommen uit Task 1/2, camelCase niet — houd snake_case zoals Supabase teruggeeft); `ShareMode = 'full' | 'share'`.
- Produces in `aggregate.ts`:
  - `applyShare(amount: number, company: FinanceCompany, mode: ShareMode): number`
  - `companySummary(c: FinanceCompany, data: { monthly: MonthlyRow[]; bank: BankAccount[]; items: OpenItem[]; targets: Target[] }, opts: { month: string /* 'YYYY-MM-01' */; today: string; mode: ShareMode }): CompanySummary` met `CompanySummary = { companyId; name; bank: number|null; revenueMonth: number|null; targetMonth: number|null; targetPct: number|null; revenueYtd: number|null; revenuePrevYtd: number|null; resultYtd: number|null; receivables: number; overdue: number; payables: number; health: 'good'|'warning'|'critical'|'unknown' }`
  - `groupSummary(rows: CompanySummary[]): GroupSummary` (zelfde bedragvelden, opgeteld; `targetPct` = som revenue / som target over alleen bedrijven mét target; `null`-velden tellen niet mee)
- Produces in `forecast.ts`: `forecast13Weeks(input: { startBalance: number; items: OpenItem[]; fixedCosts: FixedCost[]; today: string }): { weekStart: string; balance: number; inflow: number; outflow: number }[]` (13 elementen).
- Produces in `format.ts`: `eur(n: number | null, opts?: { decimals?: 0|2 }): string` (null → "—"), `freshness(syncedAt: string | null, now: Date): { label: string; stale: boolean }`.

- [ ] **Step 1: Tests schrijven** (`aggregate.test.ts`, `forecast.test.ts`, `format.test.ts`):
  - `applyShare(1000, {ownership_pct: 40}, 'share') === 400`; `'full'` → 1000; ownership 0 → 0.
  - companySummary zonder target voor de maand → `targetMonth === null`, `targetPct === null`.
  - companySummary van bedrijf met `last_synced_at === null` → `health === 'unknown'`, `bank === null`, `revenueMonth === null`.
  - health: `sync_error` gezet → `'critical'`; targetPct < 0.6 of bank < min_buffer → `'critical'`; targetPct < 0.85 of overdue > 25% van receivables → `'warning'`; anders `'good'`.
  - overdue = som receivables met `due_date < today`.
  - groupSummary: twee bedrijven (revenue 100/target 200, revenue 50/geen target) → `targetPct === 0.5`, `revenueMonth === 150`.
  - forecast: startBalance 1000, receivable 500 due over 10 dagen, payable 200 due gisteren, fixedCost 430/maand → week 1: inflow 0, outflow `200 + 430*12/52` (toBeCloseTo), week 2: inflow 500; te late receivable (due vorige maand) → in week 1.
  - `eur(1234.5) === '€ 1.235'`, `eur(1234.5,{decimals:2}) === '€ 1.234,50'`, `eur(null) === '—'`; `freshness` > 26 uur oud → `stale: true`.
- [ ] **Step 2:** `npx vitest run src/lib/finance` → FAIL.
- [ ] **Step 3:** Implementeren. Weekgrenzen: maandag-start (date-fns `startOfWeek(..., { weekStartsOn: 1 })`); vaste lasten per week = `monthly_amount * 12 / 52` voor actieve kosten.
- [ ] **Step 4:** vitest → PASS.
- [ ] **Step 5: Commit** `feat(finance): rekenlaag voor totalen en 13-wekenprognose`.

### Task 4: Exact-koppeling (edge functions)

**Files:**
- Modify: `vitest.config.ts` (include `supabase/functions/**/*.test.ts`)
- Create: `supabase/functions/_shared/exact/mapping.ts` (+ `mapping.test.ts`), `supabase/functions/_shared/exact/client.ts`, `supabase/functions/exact-auth/index.ts`, `supabase/functions/exact-sync/index.ts`
- Modify: `supabase/config.toml` (`[functions.exact-auth] verify_jwt = false` — callback komt van Exact zonder JWT)

**Interfaces:**
- Env: `EXACT_CLIENT_ID`, `EXACT_CLIENT_SECRET`, `EXACT_REDIRECT_URI` (= `<SUPABASE_URL>/functions/v1/exact-auth/callback`), `EXACT_BASE_URL` (default `https://start.exactonline.nl`), `APP_URL` (redirect na callback, default `https://sales.klikklaarseo.nl`).
- `mapping.ts` (geen imports):
  - `mapMonthly(rows: ExactReportingBalance[], glTypes: Map<string, number>, year: number): { month: string; revenue: number; costs: number }[]` — alleen `BalanceType === 'W'`; omzet = −Amount van GL met Type 110; kosten = Amount van overige W-rekeningen; per `ReportingPeriod` (1–12) → `${year}-MM-01`.
  - `mapBankAccounts(balances: ExactReportingBalance[], glAccounts: ExactGLAccount[], lastLines: Map<string, string>): { account_code; name; balance; last_statement_date }[]` — GL Type 12; saldo = cumulatief t/m laatste periode.
  - `mapOpenItems(rows: ExactListItem[], kind: 'receivable'|'payable'): {...}[]` (Exact `/read/financial/ReceivablesList` en `PayablesList`; bedrag positief).
  - `mapSupplierSpend(entries: ExactPurchaseEntry[]): {...}[]` — laatste factuur per leverancier.
  - `parseExactDate(s: string): string | null` (`/Date(1700000000000)/` → `YYYY-MM-DD`).
- `client.ts`: `getAccessToken(admin: SupabaseClient): Promise<string>` (ververst als `expires_at` < nu+60s; slaat nieuw refresh_token op — Exact roteert die), `exactGetAll<T>(token: string, path: string, opts?): Promise<T[]>` (volgt `__next`, wacht bij `X-RateLimit-Minutely-Remaining` ≤ 2 tot `X-RateLimit-Minutely-Reset`, gooit bij 401 een `ExactAuthError`).
- `exact-auth`: `GET /exact-auth/start` (Authorization: super_admin JWT) → `{ url }` met `state` = HMAC van user-id; `GET /exact-auth/callback?code&state` → tokens opslaan in `finance_exact_connection`, redirect naar `${APP_URL}/finance/bedrijven?exact=connected`.
- `exact-sync`: `POST` (service role óf super_admin óf finance-manage-gebruiker; anders 403). Body `{ companyId?: string }`. Haalt divisies (`/api/v1/{current}/hrm/Divisions` — builder verifieert endpoint), upsert `finance_companies` op `exact_division` (nieuwe → zonder toegang), slaat uitgesloten bedrijven over, per bedrijf: monthly (dit jaar + vorig jaar), bank, open items (vervang alle rijen van dat bedrijf/kind), supplier spend (laatste 120 dagen); zet `last_synced_at`/`sync_error`. Antwoord `{ synced: number, failed: { companyId, error }[] }`. Geen eigen data → 409 `{ error: 'Exact niet gekoppeld' }`.

- [ ] **Step 1:** vitest include uitbreiden; `mapping.test.ts` met fixtures (handgemaakte Exact-JSON): omzetrekening Type 110 met Amount −1000 in periode 3 → `{month:'2026-03-01', revenue:1000}`; kostenrekening 4000 Amount 300 → costs 300; balansrekening (`'B'`) genegeerd in monthly; bankrekening Type 12 saldo; `parseExactDate('/Date(1763510400000)/') === '2025-11-19'`; receivable met negatief Amount (creditnota) blijft negatief.
- [ ] **Step 2:** `npx vitest run supabase/functions` → FAIL.
- [ ] **Step 3:** `mapping.ts` implementeren → PASS.
- [ ] **Step 4:** `client.ts`, `exact-auth`, `exact-sync` schrijven (Deno, patroon `bunq-sync` voor cors/json/createClient). Endpoints en GL-typecodes markeren met `// VERIFY tegen echte administratie` waar niet uit de docs zeker.
- [ ] **Step 5:** `deno check supabase/functions/exact-sync/index.ts supabase/functions/exact-auth/index.ts` (als deno ontbreekt: `npx -y deno check …`) → geen fouten.
- [ ] **Step 6: Commit** `feat(finance): Exact-koppeling (auth + sync)`.

### Task 5: Finance-schil in de frontend + oude finance weg

**Files:**
- Create: `src/hooks/useFinance.ts` (+ `useFinance.test.tsx`), `src/pages/finance/FinanceFilter.tsx`, `src/pages/finance/FinanceRoute.tsx`, `src/components/finance/{KpiTile,FreshnessBadge}.tsx`
- Rewrite: `src/pages/finance/FinanceLayout.tsx`
- Modify: `src/App.tsx` (finance-routes), `src/components/layout/AppSidebar.tsx` (+ test)
- Delete: oude pages/hooks/bunq-sync (zie File Structure)
- Modify: `src/integrations/supabase/types.ts` (nieuwe tabellen + `finance_me` toevoegen, handmatig in hetzelfde formaat)

**Interfaces:**
- Consumes: Task 1–3 types/tabellen.
- Produces in `useFinance.ts`: `useFinanceMe(): UseQueryResult<{ has_access: boolean; level: 'view'|'manage'|null; is_super_admin: boolean }>`; `useFinanceCompanies({ includeExcluded?: boolean })`; `useFinanceMonthly(years: number[])`; `useFinanceBank()`; `useFinanceOpenItems(kind)`; `useFinanceTargets(year)`; `useFinanceFixedCosts()`; `useFinanceSupplierSpend()`; mutations `useUpdateFinanceCompany()`, `useUpsertTarget()`, `useSaveFixedCost()`, `useRefreshExact()` (invoke `exact-sync`, invalidate `['finance']`). Alle query keys beginnen met `'finance'`.
- `FinanceFilter.tsx`: `FinanceFilterProvider`, `useFinanceFilter(): { companyId: string | 'all'; setCompanyId; mode: ShareMode; setMode; month: string; setMonth }` (month default = huidige maand, `'YYYY-MM-01'`).
- `FinanceRoute`: laadt `useFinanceMe`; geen toegang → `<Navigate to="/" replace />`.
- Routes: `/finance` (Overzicht), `/finance/omzet`, `/finance/liquiditeit`, `/finance/debiteuren`, `/finance/bedrijven`, `/finance/rapportage`. Tijdelijk elk een placeholder-component tot Task 6–10.

- [ ] **Step 1: Tests**: `useFinance.test.tsx` (mock-patroon van `useTasks.test.tsx`): `useFinanceMe` roept `rpc('finance_me')`; `useFinanceCompanies()` filtert `excluded=false`, met `includeExcluded:true` niet; `useRefreshExact` roept `functions.invoke('exact-sync')`. `AppSidebar.test.tsx`: Finance-item zichtbaar als `finance_me.has_access`, onzichtbaar voor `admin` zonder finance.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3:** Implementeren. Layout: titel "Finance", tabs (Overzicht · Omzet & Resultaat · Cash & Liquiditeit · Facturen & Debiteuren · Bedrijven · Rapportage), filterbalk rechts: bedrijfsselect ("Alle bedrijven" + zichtbare bedrijven), toggle "100% / aandeel OneGroup", `FreshnessBadge` (oudste `last_synced_at` van zichtbare bedrijven, "Exact bijgewerkt 14:05"; rood als stale), knop "Nu verversen" alleen bij `level === 'manage'`. Lege staat (geen bedrijven): "Je hebt nog geen toegang tot bedrijven. Vraag een beheerder om toegang." Oude bestanden verwijderen; `grep -rn "useCash\|useFinancials\|useContracts\|useInvoices\|bunq-sync" src` → leeg.
- [ ] **Step 4:** `npm test` en `npm run build` → groen.
- [ ] **Step 5: Commit** `feat(finance): nieuwe finance-schil, oude finance-sectie verwijderd`.

### Task 6: Overzicht

**Files:** Create `src/pages/finance/OverzichtPage.tsx` (+ `OverzichtPage.test.tsx`)

**Interfaces:** Consumes `companySummary`, `groupSummary`, hooks uit Task 5, `KpiTile`.

- [ ] **Step 1: Test** (hooks gemockt met twee bedrijven): toont vijf tegels met labels exact `Banksaldo`, `Omzet <maandnaam> vs target`, `Omzet YTD`, `Resultaat YTD`, `Open debiteuren`; groepslabel bevat "excl. intercompany"; aandeel-modus halveert een bedrijf met 50%; bedrijf zonder sync toont "nog niet gesynchroniseerd" en "—"; geen "Top open deals".
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren volgens mockup B: tegels, recharts horizontale bar "Omzet <maand> tegenover target" (balk = omzet, `ReferenceLine`/marker = target, kleur naar health), daaronder kaarten per bedrijf (bank, resultaat YTD, open debiteuren · te laat, health-stip). Bij bedrijfsfilter ≠ all: alleen dat bedrijf. **Step 4:** PASS + build. **Step 5: Commit** `feat(finance): overzichtspagina`.

### Task 7: Omzet & Resultaat

**Files:** Create `src/pages/finance/OmzetResultaatPage.tsx` (+ test)

- [ ] **Step 1: Test**: tabel per maand (jan–dec huidig jaar) met kolommen `Omzet`, `Target`, `Kosten`, `Resultaat`, `Vorig jaar`; resultaat = omzet − kosten; aandeel-modus toegepast; totaalrij YTD.
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren; layout overnemen van finance-control `src/pages/OmzetResultaat.tsx` (fc-src) maar zonder handmatige invoer: lijngrafiek omzet dit jaar vs vorig jaar vs target, tabel eronder. **Step 4:** PASS + build. **Step 5: Commit** `feat(finance): omzet en resultaat uit Exact`.

### Task 8: Cash & Liquiditeit

**Files:** Create `src/pages/finance/CashLiquiditeitPage.tsx`, `src/components/finance/FixedCostDialog.tsx` (+ tests)

**Interfaces:** Consumes `forecast13Weeks`, `useSaveFixedCost`, `useFinanceSupplierSpend`.

- [ ] **Step 1: Tests**: prognosegrafiek krijgt 13 punten en een buffer-lijn = som `min_buffer` van zichtbare bedrijven; uitleg-tekst bevat "Te late debiteuren tellen mee in week 1"; banktabel toont "Laatste afschrift" rood als ouder dan 7 dagen; vaste-lastentabel toont "Echt betaald" uit supplier spend en markeert afwijking > 5%; knop "+ Nieuwe maandlast" alleen bij manage; dialoog valideert naam verplicht, bedrag ≥ 0, bedrijf verplicht (alleen bedrijven waar gebruiker manage heeft), categorie uit de 7 waarden; opslaan roept `useSaveFixedCost` met juiste payload. Totaal vaste lasten en runway = bank / (vaste lasten p/m) in maanden, afgerond naar beneden.
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren volgens mockup `cash-liquiditeit.html`. **Step 4:** PASS + build. **Step 5: Commit** `feat(finance): cash, prognose en vaste lasten`.

### Task 9: Facturen & Debiteuren + Bedrijven

**Files:** Create `src/pages/finance/DebiteurenPage.tsx`, `src/pages/finance/BedrijvenPage.tsx` (+ tests)

- [ ] **Step 1: Tests**: Debiteuren toont receivables met kolommen `Bedrijf`, `Factuur`, `Klant`, `Bedrag`, `Vervaldatum`, `Dagen te laat`; filter "Alleen te laat"; sorteert standaard op dagen te laat aflopend; geen bewerkknoppen. Bedrijven: rij per bedrijf (super_admin ziet ook uitgesloten, gemarkeerd), velden aandeel %, minimumbuffer, target per maand (12 invoervelden voor geselecteerd jaar) bewerkbaar bij manage, schakelaar "Uitsluiten" alleen voor super_admin, syncstatus + foutmelding; knop "Exact koppelen" voor super_admin roept `exact-auth/start` en navigeert naar de teruggegeven url; `?exact=connected` toont toast "Exact gekoppeld".
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren. **Step 4:** PASS + build. **Step 5: Commit** `feat(finance): debiteuren en bedrijvenbeheer`.

### Task 10: Rapportage (A4 + PDF)

**Files:** Create `src/pages/finance/RapportagePage.tsx` (+ test), print-CSS in `src/index.css` (`@media print`)

- [ ] **Step 1: Test**: keuze groep/bedrijf + maand; rapport bevat secties `Banksaldi`, `Omzet <maand> vs target`, `Prognose 13 weken`, `Open debiteuren` (+ te laat); alleen bedrijven waar de gebruiker toegang toe heeft; knop "Download PDF" roept `window.print()`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren: A4-container (210mm), print-CSS verbergt sidebar/tabs/filters, kop met "OneGroup — Financieel overzicht <maand>", datum en "Exact bijgewerkt …". PDF = browser "Opslaan als PDF" via print-dialoog. **Step 4:** PASS + build. **Step 5: Commit** `feat(finance): rapportage met PDF-export`.

### Task 11: Finance-toegang in gebruikersbeheer

**Files:** Create `src/components/finance/FinanceAccessCell.tsx` (+ test); Modify `src/pages/UserManagementPage.tsx` (kolom "Finance" na "Bedrijven (pipeline-toegang)")

- [ ] **Step 1: Test**: cel toont select `Geen / Kijken / Beheren`; kiezen schrijft/verwijdert `finance_access`; popover met checkbox per finance-bedrijf schrijft/verwijdert `finance_company_access`; voor super_admin-gebruikers toont de cel "Altijd alles (super admin)" zonder controls; cel alleen gerenderd als de huidige gebruiker super_admin is.
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren. **Step 4:** PASS + build. **Step 5: Commit** `feat(finance): finance-toegang per gebruiker en bedrijf beheren`.

### Task 12: Eenmalige overname uit finance-control

**Files:** Create `src/lib/finance/fcImport.ts` (+ test), `scripts/finance-control-import.mjs`

**Interfaces:** `buildImportSql(input: { companies: FcCompany[]; targets: FcTarget[]; expenses: FcExpense[]; mapping: Record<string /*fc company id*/, number /*exact_division*/> }): string`

- [ ] **Step 1: Test**: alleen `recurring && active` expenses → `finance_fixed_costs` (category-mapping: fc `personeel|huisvesting|software|marketing|verzekeringen|advies|overig` 1-op-1, onbekend → `overig`; `amount` → `monthly_amount`); targets → `finance_targets`; companies → upsert op `exact_division` met `ownership_pct`; fc-bedrijf zonder mapping → staat in een `-- NIET GEKOPPELD:` commentaarregel, geen SQL; output in één `BEGIN; … COMMIT;`; strings ge-escaped (`O'Reilly`).
- [ ] **Step 2:** FAIL. **Step 3:** Implementeren; script leest JSON-exports + `mapping.json` uit een opgegeven map en schrijft `import.sql` (niet uitvoeren). **Step 4:** PASS. **Step 5: Commit** `feat(finance): importscript vanuit finance-control`.

### Task 13: Lokale demo + uitrol-doc

**Files:** Create `scripts/finance-local.sh`, `supabase/seed/finance_demo.sql`, `docs/ops/2026-11-19-finance-rollout.md`

- [ ] **Step 1: Demo-seed**: 5 bedrijven (KlikKlaar SEO 100%, Mandate 60%, LabelLift 100%, LeadLayer 50%, Wantveld 30%), een uitgesloten bedrijf, 23 maanden `finance_monthly`, bankrekeningen (één met laatste afschrift 12 dagen oud), ~30 open items (deels te laat), targets dit jaar, 8 vaste lasten met supplier spend (één afwijkend), één bedrijf met `sync_error`. Demo-gebruikers met wachtwoord `demo-finance-123`: `super@demo.local` (super_admin), `kijker@demo.local` (admin + finance view op 2 bedrijven), `beheer@demo.local` (admin + finance manage op 3 bedrijven), `sales@demo.local` (sales_executive, geen finance).
- [ ] **Step 2: Script** `scripts/finance-local.sh`: maakt tijdelijke workdir met eigen `config.toml` (project_id `kk-finance-local`, poorten 5532x zodat bestaande stacks blijven draaien), `supabase start --workdir`, laadt `.live_schema.sql`, `2026110[45]*.sql`, `20261119*.sql`, seed; maakt de demo-users via de auth admin API; schrijft `.env.local` met lokale `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` (`.env.local` in .gitignore — controleren). `--stop` ruimt op.
- [ ] **Step 3: Draaien**: `bash scripts/finance-local.sh && npm run dev` → inloggen als elk demo-account; check: sales ziet geen Finance; kijker ziet 2 bedrijven, geen bewerkknoppen; beheer kan maandlast toevoegen en kijker/super krijgen melding; super ziet alles incl. uitgesloten; rapport-PDF bevat alleen toegankelijke bedrijven.
- [ ] **Step 4: Ops-doc**: Exact App Center-registratie (redirect `https://<project>.supabase.co/functions/v1/exact-auth/callback`), secrets zetten, functions deployen, migraties via aparte push-map, cron-job (`exact-sync` elk uur, via `cron.schedule` + `net.http_post` met service key uit vault — niet in een migratie), eerste koppeling + sync, import uit finance-control, toegang aanzetten, oude tabellen later droppen.
- [ ] **Step 5: Commit** `chore(finance): lokale demo-omgeving en uitrolplan`.
