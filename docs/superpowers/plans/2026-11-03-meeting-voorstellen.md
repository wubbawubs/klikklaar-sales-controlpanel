# Meeting verwerken — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a Plaud transcript, get AI-proposed CRM changes per deal, review them, and apply each one safely.

**Architecture:** Two new tables (`meeting_imports`, `meeting_proposals`). An edge function `meeting-analyze` builds a CRM snapshot, calls the Lovable AI Gateway with tool-calling, normalises the output (pure module, unit-tested) and stores proposals. Applying runs in one SECURITY DEFINER RPC `apply_meeting_proposal` per proposal (atomic, stale-check, audit). The client then fires the existing webhooks. The UI is a new `/meetings` page plus a review page.

**Tech Stack:** React 18, Vite, TS (non-strict), TanStack Query, shadcn/ui, Supabase (Postgres, Deno edge functions), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-03-meeting-transcript-voorstellen-design.md`

## Global Constraints

- Supabase project ref `boxmdblzhuyfontwibdj`. There is no DB password: apply DDL through the one-shot token-gated `run-ddl-once` function from the deal-hub plan. Never commit that function, and delete it afterwards.
- The UI copy is in Dutch. Page H1 style: `text-xl font-semibold`.
- Call CRM tables with `supabase.from('<table>' as any)`, as the existing hooks do (`types.ts` lacks them).
- Model: `google/gemini-2.5-pro` via `https://ai.gateway.lovable.dev/v1/chat/completions`, key `LOVABLE_API_KEY`.
- Won and lost stages are matched by name, case-insensitive and trimmed: won = `won`/`gewonnen`, lost = `verloren`/`lost`.
- Appointment times are entered in Europe/Amsterdam and stored as timestamptz.
- Do not touch the untracked `20260702*_knowledge.sql` migrations, `closer_appointments`, or the Pipedrive tables.
- Never write a guessed value. When an id, date, amount or owner is invalid or missing, leave it `null` so the UI forces the user to choose.
- Frontend publish (push to `main` + Lovable deploy) happens only after Robin's OK.

## Review Focus

1. **A transcript naming a company that exists twice** ("Jansen" → Bakkerij Jansen, Jansen Installatie). The proposal must stay unbound with both as candidates. Test: Task 1 `keeps ambiguous company unbound with candidates`.
2. **The AI returning invented refs** (`c999`, `d77`, a stage ref that isn't in the list). These must become `null`, never be dropped and never crash. Test: Task 1 `nulls unknown refs`.
3. **A deal changed by a colleague between analysis and apply.** It must fail with a clear message and the deal must stay untouched. Test: Task 2 SQL check (c).
4. **"Belt vrijdag terug" with a meeting on a Friday** must resolve to the *next* Friday, not today. This is enforced by the prompt rule and by the server check that an appointment date is ≥ the meeting date (otherwise null). Test: Task 1 `nulls appointment dates before the meeting`.
5. **Applying twice** (double click, two colleagues at once). The second attempt must not apply again. Test: Task 2 SQL check (f).

---

## File map

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/meetingNormalize.ts` | Pure: snapshot refs + AI output → proposal rows |
| `src/lib/meetingNormalize.test.ts` | Tests for the above |
| `src/lib/meetingProposals.ts` (+ `.test.ts`) | Pure client logic: `stageKind`, `proposalBlockers`, `describeProposal`, `groupByCompany` |
| `supabase/migrations/20261103000001_meeting_imports.sql` | Tables, RLS, `apply_meeting_proposal` RPC |
| `supabase/functions/meeting-analyze/index.ts` | Auth, snapshot, AI call, store proposals (background) |
| `src/hooks/useMeetings.ts` | Queries and mutations |
| `src/components/meeting/ProposalCard.tsx` (+ `.test.tsx`) | One proposal: fields, blockers, apply/dismiss |
| `src/pages/MeetingsPage.tsx`, `src/pages/MeetingReviewPage.tsx` | Paste form + history; review screen |
| `src/App.tsx`, `src/components/layout/AppSidebar.tsx` | Route + nav item "Meetings" |

## Shared types (`src/lib/meetingProposals.ts`, also mirrored in `_shared/meetingNormalize.ts`)

```ts
export type ProposalKind = 'stage' | 'won' | 'lost' | 'note' | 'value' | 'owner' | 'appointment' | 'new_deal';
export interface ProposalPayload {
  stage_id?: string | null; lost_reason?: string | null; body?: string | null;
  value_eur?: number | null; user_id?: string | null;
  date?: string | null; time?: string | null; appointment_type?: 'call' | 'meeting'; title?: string | null;
  company_name?: string | null; contact_name?: string | null; deal_title?: string | null;
}
export interface ProposalRow {
  position: number; kind: ProposalKind; company_id: string | null; deal_id: string | null;
  company_label: string; candidates: string[]; payload: ProposalPayload;
  expected: { stage_id: string | null; value_eur: number | null; assigned_to: string | null } | null;
  quote: string;
}
```

---

### Task 1: Normalise the AI output (pure, server-side)

**Files:** Create `supabase/functions/_shared/meetingNormalize.ts`, Test `src/lib/meetingNormalize.test.ts`

**Interfaces — Produces:**
- `buildSnapshot(input: { companies: {id,name}[]; deals: {id,title,company_id,stage_id,value_eur,assigned_to}[]; stages: {id,name,position}[]; members: {user_id,name}[] }): Snapshot`. It assigns refs `c1..`, `d1..`, `s1..`, `u1..` and keeps maps both ways.
- `snapshotPrompt(s: Snapshot): string`. Compact lines: `c12 | Bakkerij Jansen`, `d4 | c12 | Website redesign | s3 Voorstel | €2500 | u2`.
- `normalizeProposals(ai: AiItem[], s: Snapshot, meetingDate: string): ProposalRow[]`
- `AiItem` = the tool schema item: `{kind, company_ref, candidate_company_refs, company_name, deal_ref, quote, stage_ref, lost_reason, body, value_eur, user_ref, date, appointment_type, title, deal_title, contact_name}`. Every field except `kind` and `quote` is nullable.

Rules:
- Unknown refs become `null`.
- A deal that doesn't belong to the chosen company becomes `null`.
- No `deal_ref` and the company has exactly one open (non won/lost) deal → bind to that deal.
- `candidates` = the valid candidate company ids, only when `company_id` is null.
- `value_eur` must be a finite number > 0, otherwise `null`.
- An appointment `date` must be `YYYY-MM-DD`, a real date, and ≥ `meetingDate`, otherwise `null`. `time` is always `null`. `appointment_type` defaults to `call`. `user_id` defaults to the deal's `assigned_to`.
- Unknown `kind` → the item is turned into a `note` with `body = quote`, so it is never dropped silently.
- `expected` = the bound deal's `{stage_id, value_eur, assigned_to}`, or `null`.
- `company_label` = company name, else the AI `company_name`, else `'Onbekende klant'`.

- [ ] **Step 1: Write failing tests** in `src/lib/meetingNormalize.test.ts` (import `../../supabase/functions/_shared/meetingNormalize`). Fixture: companies Bakkerij Jansen (`co1`), Jansen Installatie (`co2`), Garage De Vries (`co3`). Deals: `de1` (co1, Voorstel), `de3a` + `de3b` (co3, both open). Stages Voorstel, Onderhandeling, Won, Verloren.
  - `binds the single open deal of a company`: stage item for c(co1), no deal_ref → `deal_id 'de1'`, `expected.stage_id` = Voorstel id, `payload.stage_id` = Onderhandeling id.
  - `keeps ambiguous company unbound with candidates`: company_ref null, candidates [co1, co2] → `company_id null`, `candidates ['co1','co2']`.
  - `leaves deal unbound when a company has two open deals`: co3 → `deal_id null`, `company_id 'co3'`.
  - `nulls unknown refs`: company_ref `c999`, stage_ref `s99`, user_ref `u42` → company_id, payload.stage_id and payload.user_id are all `null`. The row is still returned.
  - `nulls appointment dates before the meeting`: meetingDate `2026-11-06`, date `2026-11-06` → kept; `2026-11-05` → `null`; `2026-13-01` → `null`. `time` is always `null` and `user_id` is the deal owner.
  - `turns unknown kinds into notes`: kind `foo`, quote `"x"` → kind `note`, body `"x"`.
  - `rejects non-positive values`: value_eur 0 and -5 → `null`.
- [ ] **Step 2:** `npx vitest run src/lib/meetingNormalize.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. The file must stay import-free so that both Deno and vitest can load it.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(meetings): normalise AI proposals against CRM snapshot`.

### Task 2: Tables, RLS and the apply RPC

**Files:** Create `supabase/migrations/20261103000001_meeting_imports.sql`

Schema:
- `meeting_imports(id uuid pk, org_id uuid not null → organizations cascade, created_by uuid default auth.uid(), title text, meeting_date date not null default current_date, transcript text not null, status text not null default 'analyzing' check in ('analyzing','ready','failed'), error text, analyzed_at timestamptz, created_at timestamptz default now())`
- `meeting_proposals(id uuid pk, org_id uuid not null, import_id uuid not null → meeting_imports cascade, position int not null, kind text not null check in (8 kinds), company_id uuid → companies set null, deal_id uuid → deals set null, company_label text not null, candidates jsonb not null default '[]', payload jsonb not null default '{}', expected jsonb, quote text, status text not null default 'open' check in ('open','applied','dismissed','failed'), error text, applied_at timestamptz, applied_by uuid, created_at timestamptz default now())`, plus an index on `import_id`.
- RLS on both tables: `FOR ALL` org members, using the same `user_organizations` expression as `crm_appointments` (USING + WITH CHECK).

`apply_meeting_proposal(p_proposal_id uuid, p_input jsonb) returns jsonb`, `SECURITY DEFINER SET search_path = public`. `p_input` = `{company_id, deal_id, payload, confirm_closed, expected}`. `p_input.payload` replaces the stored payload entirely.

1. `SELECT … FOR UPDATE` the proposal. If it is missing → `raise exception 'Voorstel niet gevonden'`. If the caller is not in `user_organizations` for its org → `raise exception 'Geen toegang'`. If the status is `applied` → return `{ok:false,error:'Dit voorstel is al toegepast'}`.
2. Everything else runs in `BEGIN … EXCEPTION WHEN others THEN` (subtransaction). On error: `update status='failed', error=SQLERRM` and return `{ok:false,error:SQLERRM}`.
3. Kinds other than `new_deal`: the deal must exist, have the same `org_id`, and match `company_id` when one is given. Otherwise `'Kies een deal'`. Lock it `FOR UPDATE`.
4. Stale check, with `v_exp := coalesce(proposal.expected, p_input->'expected')`, using `IS DISTINCT FROM` on the field the kind changes. stage/won/lost → `stage_id`, value → `value_eur`, owner → `assigned_to`. On a mismatch → `'Deal is sinds de analyse gewijzigd — controleer en doe dit handmatig'`.
5. Closed check: if the current stage is won or lost, the kind is stage/won/lost, and `confirm_closed` is not true → `'Deal is al gewonnen of verloren — bevestig eerst'`.
6. Per kind:
   - **stage, won, lost:** resolve the target stage. For won/lost the stage is found by name (error `'Geen gewonnen-fase gevonden'` / `'Geen verloren-fase gevonden'`). Set `stage_id` and `stage_updated_at=now()`. Moving into won sets `won_at=now(), lost_at=null, lost_reason=null`. Moving into lost sets `lost_at=now(), won_at=null, lost_reason=payload.lost_reason`. Moving into an open stage clears all three. Insert a `stage_change` activity: `Verplaatst van "X" naar "Y" (uit sales-meeting DD-MM-YYYY)`.
   - **value:** requires a number > 0. Update `value_eur` and add a note `Waarde aangepast van €X naar €Y (uit sales-meeting …)`.
   - **owner:** the user must be a member of the org. Update `assigned_to` and add a note `Eigenaar gewijzigd naar <full_name> (uit sales-meeting …)`.
   - **note:** the body must not be empty. Note body `Uit sales-meeting DD-MM-YYYY: <body>`.
   - **appointment:** requires date, time (`HH:MM`), a member owner and a type. Set `starts_at = (date||' '||time)::timestamp AT TIME ZONE 'Europe/Amsterdam'` and title = `payload.title` or `'Opvolging'`. Insert into `crm_appointments` with deal_id, company_id, contact_id from the deal, `notes = 'Uit sales-meeting …: '||quote`, and `created_by = auth.uid()`.
   - **new_deal:** requires company_name, deal_title and a stage that is in the org. Insert the company, then a contact if `contact_name` is given, then the deal (`assigned_to = auth.uid()`, `created_by = auth.uid()`). If `body` is given, add it as a note.
   - Every activity gets `created_by=auth.uid()` and `meta={source:'meeting', meeting_import_id, proposal_id}`.
7. `audit_logs` insert: actor, `'meeting_proposal.'||kind`, `'deal'`, deal id, and before/after `to_jsonb` of the deal row (for appointments, after = the appointment row).
8. Update the proposal: `status='applied'`, `applied_at`, `applied_by`, `payload`, `deal_id`, `company_id`, `error=null`.
9. Return `{ok:true, deal_id, events:[{event, payload}]}`, where events are `deal.stage_changed` (+ `deal.won` / `deal.lost`) or `deal.created`.

`REVOKE ALL … FROM public, anon; GRANT EXECUTE … TO authenticated`.

- [ ] **Step 1:** Write the migration.
- [ ] **Step 2:** Deploy `run-ddl-once` (uncommitted, as in the deal-hub plan) and apply the migration. Check with `select count(*) from meeting_proposals` → `0`.
- [ ] **Step 3: SQL checks in one rolled-back transaction** (`begin; … rollback;`). Use `set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', <member uuid>)::text, true);` with a real member and a real open deal. Insert an import and proposals, then assert:
  - (a) a `note` apply → `ok:true`, plus one `deal_activities` row and one `audit_logs` row;
  - (b) a `won` apply → the deal has the won stage and `won_at` is not null;
  - (c) a `stage` proposal with `expected.stage_id` ≠ the current stage → `ok:false`, the message contains `gewijzigd`, the deal is unchanged, and the proposal status is `failed`;
  - (d) a `stage` on the (now won) deal without `confirm_closed` → `ok:false` `bevestig`;
  - (e) an `appointment` without time → `ok:false`;
  - (f) applying (a) again → `ok:false` `al toegepast`;
  - (g) with the claims set to a uuid that is not a member → an exception `Geen toegang`.
  Expected: every assertion holds, and after `rollback` nothing remains.
- [ ] **Step 4:** Commit the migration only: `feat(meetings): tables and apply_meeting_proposal RPC`.

### Task 3: Edge function `meeting-analyze`

**Files:** Create `supabase/functions/meeting-analyze/index.ts`, Modify `supabase/config.toml` (none needed: JWT verification stays on, which is the default)

**Interfaces:** POST `{import_id}` with the user JWT → `202 {ok:true}` or a 4xx `{error}`.

- Validate the user with the anon client and the auth header. Load the import through the user client (RLS = access check). If it's not found → 404.
- Using the service client: set the import to `status='analyzing'`, set `error=null`, and delete its proposals that are not `applied`. Then return 202 and continue in `EdgeRuntime.waitUntil(run())`.
- `run()`:
  - Load the org's companies (`id,name`), deals, stages and members (`user_organizations` + `profiles.full_name`) through the service client.
  - Call `buildSnapshot` and `snapshotPrompt`, then call the AI with tool `propose_crm_changes` (schema = `AiItem[]` under `items`) and `tool_choice` forced, using `AbortSignal.timeout(140_000)`.
  - Call `normalizeProposals` and insert the rows with `org_id` and `import_id`. Set `status='ready'` and `analyzed_at=now()`.
  - On any error: `status='failed'` with a Dutch error. Map 429 → `'AI is even overbelast, probeer het over een minuut opnieuw'`, 402 → `'AI-tegoed is op'`, timeout → `'Analyse duurde te lang — probeer het opnieuw'`, everything else → `'Analyse mislukt: <msg>'`.
- System prompt (Dutch). It must state these rules:
  - Only propose what is explicitly said.
  - Never invent amounts, dates or people.
  - If unsure which company is meant, set `company_ref` null and give `candidate_company_refs`.
  - Relative days are counted from the meeting date `<YYYY-MM-DD, weekday>`, and always the *next* occurrence.
  - Without a concrete day, it's a `note`.
  - A company not in the list → `new_deal`.
  - `quote` = a short literal fragment from the transcript.
  - One item per change.
  - Ignore small talk.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `supabase functions deploy meeting-analyze --project-ref boxmdblzhuyfontwibdj`.
- [ ] **Step 3:** Smoke test after Task 5, in the browser with a sample transcript. Expected: the status goes `analyzing` → `ready` and proposals appear.
- [ ] **Step 4:** Commit `feat(meetings): meeting-analyze edge function`.

### Task 4: Client logic and hooks

**Files:** Create `src/lib/meetingProposals.ts` + `.test.ts`, `src/hooks/useMeetings.ts`

**Produces:**
- `stageKind(name: string | null | undefined): 'won' | 'lost' | null`
- `proposalBlockers(p: {kind; company_id; deal_id; payload}, ctx: { dealStageName: string | null; confirmClosed: boolean }): string[]`. The Dutch blockers are: `Kies klant`, `Kies deal`, `Kies fase`, `Vul bedrag in`, `Kies eigenaar`, `Kies datum`, `Vul tijd in`, `Notitie is leeg`, `Vul bedrijfsnaam in`, `Vul dealnaam in`, `Deal is al gewonnen of verloren — bevestig`.
- `describeProposal(p, lookups: {stageName(id), userName(id)}): string`, e.g. `Fase → Onderhandeling`, `Verloren (te duur)`, `Opvolging: call op vr 7 nov`.
- `groupByCompany<T extends {company_label: string}>(rows: T[]): {label: string; items: T[]}[]`, which keeps the first-seen order.
- Hooks:
  - `useMeetingImports()` lists the org's imports, newest first, without the transcript.
  - `useMeetingImport(id)` uses `refetchInterval: 3000` while `analyzing`.
  - `useMeetingProposals(importId)` returns proposals ordered by position.
  - `useCreateMeetingImport()` inserts the import and invokes `meeting-analyze`; it returns the id.
  - `useReanalyze()`.
  - `useApplyProposal()` calls `rpc('apply_meeting_proposal', {p_proposal_id, p_input})`. When `ok`, it fires each event via `fireWebhook`, then invalidates `meeting-proposals`, `deals`, `activities`, `company-activities`, `appointments` and `companies`. When `!ok`, it throws `Error(result.error)`.
  - `useDismissProposal()`.

- [ ] **Step 1: Failing tests:**
  - `stageKind('Won')`, `stageKind(' gewonnen ')` → `won`; `Verloren` → `lost`; `Voorstel` → `null`.
  - The blockers for an appointment with date but no time → `['Vul tijd in']`.
  - A stage proposal without a deal → it contains `Kies deal`.
  - A stage proposal on a deal in `Won` without confirm → it contains the confirm blocker, and with `confirmClosed` it does not.
  - A `new_deal` with everything filled → `[]`.
  - `groupByCompany` keeps the order.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(meetings): client proposal logic and hooks`.

### Task 5: UI

**Files:** Create `src/components/meeting/ProposalCard.tsx` + `.test.tsx`, `src/pages/MeetingsPage.tsx`, `src/pages/MeetingReviewPage.tsx`; Modify `src/App.tsx` (routes `/meetings`, `/meetings/:id`), `AppSidebar.tsx` (item `{ to: '/meetings', icon: FileText, label: 'Meetings' }` after Agenda)

- **MeetingsPage:**
  - H1 `Meeting verwerken`.
  - Fields: date (default today), optional title, transcript textarea with placeholder `Plak hier het transcript van Plaud of een gespreksverslag…`.
  - Button `Analyseren`, disabled while the textarea is empty, the org is null (show `Kies eerst één organisatie bovenin`), or a submit is pending. After submit, navigate to `/meetings/:id`.
  - Below the form: `Eerdere meetings`, showing date, title, a status badge and an open/applied count.
- **MeetingReviewPage:**
  - `analyzing`: spinner and `AI leest het transcript… dit duurt meestal 1–2 minuten`.
  - `failed`: the error and `Opnieuw analyseren`.
  - `ready`: proposals grouped by company, each as a `ProposalCard`.
  - A sticky top bar with counts and the button `Alles toepassen wat klaar is (N)`. It applies the open proposals with no blockers one by one, in order, and continues past failures. Afterwards it toasts `X toegepast, Y mislukt`.
  - A collapsible `Transcript bekijken`.
  - Drafts per proposal are kept in the page state: `{company_id, deal_id, payload, confirm_closed}`, initialised from the proposal.
- **ProposalCard**, with props `{proposal, draft, onDraftChange, onApply, onDismiss, applying, companies, deals, stages, team}`:
  - It shows the kind badge, `describeProposal`, and the quote (muted, italic, in quotation marks).
  - A company combobox (Popover + Command, candidates on top) appears when `company_id` is null or the user clicks `wijzig`. A deal select shows the company's deals.
  - Kind-specific inputs: a stage select; a value input; an owner select; an appointment date, time, type and owner; a textarea for note text; new_deal fields; lost reason.
  - A `Bevestig: deal is al gewonnen/verloren` checkbox appears when relevant.
  - Blockers are listed in amber, and `Toepassen` is disabled while there are any.
  - Status `applied` → a green `Toegepast` and the inputs are hidden. `dismissed` → collapsed, with `Terugzetten`. `failed` → the red error and the button `Opnieuw proberen`.

- [ ] **Step 1: Failing component tests (ProposalCard):**
  - An appointment without time renders `Vul tijd in` and `Toepassen` is disabled.
  - A filled note: clicking `Toepassen` calls `onApply`.
  - The status `failed` with error `Deal is sinds de analyse gewijzigd` shows that text and `Opnieuw proberen`.
  - The status `applied` shows `Toegepast` and no `Toepassen` button.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement the card, the pages, the routes and the nav. **Step 4:** Run `npx vitest run`, `npm run build`, then lint the new files only. Expected: tests pass and the build succeeds.
- [ ] **Step 5:** Manual check in local dev (`npm run dev`, logged in): paste a sample transcript about real test deals, review, apply a note, check the deal timeline, and check that a ready proposal applies with `Alles toepassen`.
- [ ] **Step 6:** Commit `feat(meetings): paste, review and apply UI`.

### Task 6: Wrap-up

- [ ] Delete `run-ddl-once` and unset `DDL_TOKEN`.
- [ ] Whole-branch review (one fresh reviewer).
- [ ] Ask Robin before publishing. Then: guard `.env` PROJECT_ID, merge to `main`, push, run Lovable `deploy_project` (`d32bf8e7-c4f0-46e8-b857-540e410dd58d`), and check that the live bundle points to `boxmdblzhuyfontwibdj`.
