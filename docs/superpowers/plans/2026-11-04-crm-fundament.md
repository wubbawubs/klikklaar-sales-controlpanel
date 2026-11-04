# CRM Foundation and Data Safety Implementation Plan (plan 1 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put funnels, configurable-field storage, a trash bin and a full change history under the existing CRM, migrating every client's data in place with a self-verifying migration. The live CRM must keep working throughout.

**Architecture:**
- **Additive SQL only.** New tables `funnels`, `crm_fields`, `deal_contacts` and `crm_history`, plus new columns on existing tables. No column is dropped and no row is rewritten except the explicit backfills.
- **Rules live in the database, not the UI.**
  - Won/lost comes from `pipeline_stages.stage_type`. A trigger sets `won_at`/`lost_at` on every stage change.
  - Deletes are turned into soft deletes by a `BEFORE DELETE` trigger, so cascades and every caller — UI, RPC, edge function — are covered.
  - History is written by `AFTER` triggers.
- **The migration checks itself.** It counts rows and sums amounts per organisation before and after the change, and raises (rolling everything back) if anything differs.
- **The UI changes only where it must:** won/lost detection, the trash page, and a global error toast. The new design is plan 2.

**Tech Stack:** Postgres 17 (Supabase), plpgsql triggers and RPCs, React 18 + TanStack Query, vitest, Docker (`public.ecr.aws/supabase/postgres:17.6.1.104`) for DB tests.

**Spec:** `docs/superpowers/specs/2026-11-04-crm-productisering-design.md`

The other plans, to be written after this one ships:
- plan 2: design shell, board, list and deal detail
- plan 3: tasks
- plan 4: configuration screens and modules
- plan 5: Buitenbeleving onboarding
- plan 6: meetings adaptation

## Global Constraints

- **Branch.** Work on a new branch `feat/crm-fundament`, cut from `feat/meeting-voorstellen` (the spec says the meetings branch goes first).
- **Never run `supabase db push` from the repo root.** Remote history stops at `20260610000004`. Production pushes go through a temp dir holding only remote-registered migrations plus the new ones (pattern: `.superpowers/sdd/2026-11-03-meeting-voorstellen/push`). Robin runs the push himself, because auto mode blocks production deploys.
- **No production data is read or written by the implementer.** All DB verification happens against the Docker harness loaded with the live *schema* (no data).
- **Nothing is dropped or rewritten.**
  - Existing columns stay, including `deals.contact_id`, `deals.value_eur` and `deals.stage_id`.
  - The only data changes are backfills of NULL new columns and the creation of rows in new tables.
- **Won/lost names**, for classifying existing stages: exact match on `lower(trim(name))` in `('won','gewonnen')` → `won`, and `('lost','verloren')` → `lost`. Any other name → `open`.
- **Every new table has RLS.** Org scoping uses `public.is_org_member(auth.uid(), org_id)`, which already returns true for global admins.
- **Generated Supabase types stay stale** (they lack the CRM tables). New hooks use `const db = supabase as any` with the same eslint-disable comment as `src/hooks/useMeetings.ts:8-9`, and typed result interfaces live in `src/lib/crmTypes.ts`.
- **Copy is Dutch** (the app's language).
- **Webhook events and payloads stay as they are.** The events are `deal.created`, `deal.stage_changed`, `deal.won` and `deal.lost`.

## Review Focus

1. **A deal whose `stage_id` is NULL** (possible today via `ON DELETE SET NULL`) must still get a `funnel_id`, survive the migration and be counted.
2. **An org whose stage names match no won/lost word.** The migration must add a "Gewonnen"/"Verloren" stage pair rather than fail, and list it in the migration report.
3. **Deleting a company that has deals, appointments and documents.** Before, that hard-cascaded. Now everything must go to the trash as one batch and come back with one restore.
4. **`apply_meeting_proposal` and edge functions using the service role bypass RLS.** They must not touch soft-deleted rows, and must use `stage_type` instead of names.
5. **The `deal_fees` save path** deletes and re-inserts on every save. It must not flood the trash, though history should still show the change.

---

### Task 1: DB test harness on the live schema

**Files:**
- Create: `supabase/tests/crm_foundation/run.sh`
- Create: `supabase/tests/crm_foundation/fixtures.sql`
- Create: `supabase/tests/crm_foundation/checks.sql`
- Modify: `.gitignore` — add `supabase/tests/crm_foundation/.live_schema.sql`

**Interfaces:**
- Produces: `bash supabase/tests/crm_foundation/run.sh` exits 0 and prints `CRM FOUNDATION CHECKS PASSED` when every check passes. Later tasks append checks to `checks.sql`.

- [ ] **Step 1: `run.sh`**
  1. If `.live_schema.sql` is missing, regenerate it. This is read-only: `supabase db dump --linked -s public -f supabase/tests/crm_foundation/.live_schema.sql`, run from the push dir that holds `config.toml`.
  2. Start the Supabase postgres image on a free port.
  3. Load the schema with `psql -v ON_ERROR_STOP=0`. Extension-only objects such as pgmq may fail; log them.
  4. Assert that the tables `deals`, `pipeline_stages`, `companies`, `contacts`, `deal_activities`, `crm_appointments`, `deal_fees`, `company_items`, `meeting_proposals` and `organizations` exist.
  5. Load `fixtures.sql`, then each new migration file in order with `ON_ERROR_STOP=1`, then `checks.sql`.
  6. Always stop the container, using a trap.
- [ ] **Step 2: `fixtures.sql`.** Write the fixture data with fixed UUIDs:
  - **org L** (Klikklaar-like):
    - stages Prospect(1), Voorstel(2), Won(3), Verloren(4)
    - 5 deals: one in Won with `won_at` NULL, one in Verloren, one with `stage_id` NULL, one with `billing_type_id`, one with 2 `deal_fees`
    - 2 companies, 3 contacts (one without company)
    - 4 deal_activities, 2 crm_appointments, 1 company_items row
  - **org C** (client):
    - stages "Lead", "Offerte", "Deal gewonnen" (deliberately not an exact won name)
    - 2 deals
  - **Two users**: u_admin in `user_roles` as `super_admin`, u_member in `user_organizations` for org L only.
  - **Login simulation**: `auth.uid()` reads `request.jwt.claims` like the meeting harness does (`supabase/tests/meeting_apply/stub_schema.sql`), via `set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true)` plus `SET ROLE authenticated`.
- [ ] **Step 3: `checks.sql` skeleton.** A `DO` block with `RAISE NOTICE 'CRM FOUNDATION CHECKS PASSED'` at the end. Each later check is its own `DO` block that `RAISE EXCEPTION 'check <name>: …'` on failure.
- [ ] **Step 4:** Run `bash supabase/tests/crm_foundation/run.sh`.
  Expected: `CRM FOUNDATION CHECKS PASSED`, since no migrations exist yet.
- [ ] **Step 5: Commit** — `test(crm): live-schema DB harness for CRM foundation`

### Task 2: Funnels, stage types and self-verifying migration

**Files:**
- Create: `supabase/migrations/20261104000001_crm_funnels.sql`
- Modify: `supabase/tests/crm_foundation/checks.sql`

**Interfaces:**
- Produces:
  - `public.funnels(id uuid pk, org_id uuid not null → organizations on delete cascade, name text not null, position int not null default 0, amount_mode text not null default 'fixed' check in ('fixed','range','none'), archived_at timestamptz, created_at, updated_at)`
  - `pipeline_stages.funnel_id uuid not null → funnels`
  - `pipeline_stages.stage_type text not null default 'open' check in ('open','won','lost')`
  - `deals.funnel_id uuid not null → funnels`
  - `organizations.kind text not null default 'label' check in ('label','client')`
  - function `public.crm_integrity_counts(p_org uuid) returns jsonb` with keys:
    - `deals`, `deals_value_sum`, `deals_won`, `deals_lost`
    - `companies`, `contacts`, `deal_activities`, `crm_appointments`, `deal_fees`, `deal_fees_sum`, `company_items`, `stages`
  - schema `crm_backup_20261104`, holding `CREATE TABLE … AS SELECT *` copies of `deals`, `pipeline_stages`, `companies`, `contacts`, `deal_activities`, `crm_appointments`, `deal_fees` and `company_items`

- [ ] **Step 1: Write the failing checks** in `checks.sql`:
  - `funnel_per_org`: every org that has stages has exactly 1 funnel named `Sales pipeline`, and every stage and deal has that `funnel_id`.
  - `stage_types`: org L's Won → `won` and Verloren → `lost`. Org C's "Deal gewonnen" stays `open`, and org C gained exactly one stage "Gewonnen" (`won`) and one "Verloren" (`lost`), positioned after its last stage.
  - `null_stage_deal`: the fixture deal with NULL `stage_id` has `funnel_id` = org L's funnel and still has NULL `stage_id`.
  - `counts_unchanged`: `crm_integrity_counts` for org L equals the values computed in the fixture by hand (5 deals, …). The deal counts for org C are unchanged; its stage count is +2.
  - `backup_exists`: `crm_backup_20261104.deals` has the fixture's row count.
  - `stage_funnel_match`: an insert of a deal whose `stage_id` belongs to another funnel raises.
- [ ] **Step 2:** Run `run.sh`. Expected: FAIL at `funnel_per_org` (missing relation `funnels`).
- [ ] **Step 3: Implement the migration,** in this order inside one transaction:
  1. Snapshot the backup tables.
  2. Store `crm_integrity_counts` per org in a temp table. Create the function first.
  3. DDL.
  4. Backfill:
     - one funnel per org that has stages or deals;
     - `stage_type` by the Global Constraints names;
     - the missing won/lost stage per funnel;
     - `funnel_id` on stages, and on deals via their stage, or else the org's funnel.
  5. Set NOT NULL.
  6. Add the constraint trigger `deals_stage_in_funnel` (BEFORE INSERT/UPDATE OF stage_id, funnel_id): when `stage_id` is set and its funnel ≠ `funnel_id`, raise `'Fase hoort niet bij deze funnel'`.
  7. Add a `funnel_id` default via trigger on deal insert: use the stage's funnel, else the org's first funnel.
  8. Recompute the counts and compare per org: all keys equal, except `stages`, which may grow by the added won/lost rows. On a mismatch, `RAISE EXCEPTION` with both JSON blobs.
  9. `RAISE NOTICE` a report listing, per org:
     - the stages classified won/lost;
     - added stages;
     - deals in a won stage with NULL `won_at` (report only, never backfilled).

  Also:
  - Replace `seed_default_stages(_org_id)` so it creates the funnel and sets `stage_type` on Won/Verloren.
  - Enable RLS on `funnels`: select for members; insert/update for members who are admins of that org (Task 3 adds the client-admin rule; for now `is_admin(auth.uid())`).
- [ ] **Step 4:** Run `run.sh`. Expected: PASS, and the report lists org L's Won deal with NULL `won_at` and org C's added stages.
- [ ] **Step 5: Commit** — `feat(crm): funnels and stage types with self-verifying migration`

### Task 3: Won/lost from stage type, enforced in the database

**Files:**
- Create: `supabase/migrations/20261104000002_crm_deal_outcome.sql`
- Modify: `supabase/tests/crm_foundation/checks.sql`
- Modify: `supabase/tests/meeting_apply/checks.sql` — only if a fixture needs a `stage_type`

**Interfaces:**
- Consumes: `pipeline_stages.stage_type`, `deals.funnel_id` (Task 2).
- Produces:
  - **Trigger `deals_sync_outcome`** (BEFORE INSERT OR UPDATE OF stage_id). When the stage changes:
    - set `stage_updated_at = now()`;
    - for a `won` stage: `won_at = coalesce(won_at, now())`, `lost_at = null`, `lost_reason` kept;
    - for a `lost` stage: `lost_at = coalesce(lost_at, now())`, `won_at = null`;
    - for an `open` stage: `won_at = null`, `lost_at = null`.
  - **`user_organizations.role`** gains the meaning `'admin'` for client admins.
  - **Function `public.is_org_admin(_user uuid, _org uuid) returns boolean`**: global `is_admin`, or a `user_organizations` row with `role='admin'`.
  - **`apply_meeting_proposal`** is re-created with won/lost targets chosen by `stage_type` within the deal's funnel (`ORDER BY position LIMIT 1`), and its stage checks use `stage_type`.

- [ ] **Step 1: Failing checks.**
  - `drag_to_won`: an UPDATE of a deal's `stage_id` to org L's won stage sets `won_at`.
  - `drag_back_open`: moving that deal back to an open stage clears `won_at`.
  - `meeting_won_by_type`: run `apply_meeting_proposal` with kind `won` on an org C deal. It must land on the added "Gewonnen" stage, not "Deal gewonnen".
  - `org_admin`: `is_org_admin` is true for u_admin on org C, false for u_member on org L, and true after setting u_member's role to `admin`.
- [ ] **Step 2:** Run. Expected: FAIL at `drag_to_won` (`won_at` NULL).
- [ ] **Step 3: Implement.**
  - Switch the `funnels` insert/update policy to `is_org_admin`.
  - Keep the RPC's signature, return shape and Dutch error texts identical.
  - Run `bash supabase/tests/meeting_apply/run.sh` against a stub with `stage_type` added. Expected: `ALL CHECKS PASSED` / `CLAIM CHECKS PASSED`.
- [ ] **Step 4:** Run both harnesses. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): stage type drives won/lost in the database`

### Task 4: Field storage, contacts on several deals

**Files:**
- Create: `supabase/migrations/20261104000003_crm_fields.sql`
- Modify: `supabase/tests/crm_foundation/checks.sql`

**Interfaces:**
- Produces:
  - **`public.crm_fields`**:
    - columns: `id uuid pk`, `org_id not null`, `entity text check in ('deal','company','contact')`, `funnel_id uuid null`, `key text not null`, `label text not null`, `type text check in ('text','long_text','number','money','date','choice','yes_no')`, `options jsonb not null default '[]'` (array of `{id, label, position, archived}`), `builtin bool not null default false`, `enabled bool not null default true`, `position int`, `archived_at timestamptz`, `created_at`, `updated_at`
    - `funnel_id` is required when `entity='deal'`, and null otherwise
    - unique `(org_id, entity, coalesce(funnel_id, uuid_nil), key)`
  - **Built-in keys**, which map to real columns:
    - `amount` (`deals.value_eur` / `value_min_eur` / `value_max_eur` via `funnels.amount_mode`)
    - `billing_type` (`deals.billing_type_id`), `win_chance`, `priority`, `country`, `planned_start`, `lead_source`, `category`, `description`
  - **New deal columns**: `value_min_eur numeric(12,2)`, `value_max_eur numeric(12,2)` (check min ≤ max), `win_chance smallint check 0–100`, `priority text`, `country text`, `planned_start date`, `lead_source text`, `category text`, `description text`, `custom jsonb not null default '{}'`.
  - **Custom field values** are keyed by `crm_fields.id`, so a rename never breaks them. Choice values store the option `id`.
  - **Companies:** `custom jsonb not null default '{}'`.
  - **Contacts:** `custom jsonb not null default '{}'`, `relation_type text`, `owner_id uuid`.
  - **`public.deal_contacts`**: `(deal_id → deals, contact_id → contacts, role text, is_primary bool default false, org_id, primary key (deal_id, contact_id))`, with RLS by org.
  - **Backfill:**
    - one `deal_contacts` row (`is_primary=true`) per deal with `contact_id`;
    - for every funnel, the built-in `crm_fields` rows, where `amount` and `billing_type` are enabled and the other built-ins disabled.
- [ ] **Step 1: Failing checks.**
  - `builtin_fields`: org L's funnel has 9 built-in rows, with exactly `amount` and `billing_type` enabled.
  - `primary_contact`: `deal_contacts` count equals the number of deals with a `contact_id`.
  - `range_check`: inserting a deal with `value_min_eur` 10 > `value_max_eur` 5 raises.
  - `counts_unchanged_2`: `crm_integrity_counts` is identical before and after this migration.
- [ ] **Step 2:** Run. Expected: FAIL at `builtin_fields`.
- [ ] **Step 3: Implement.**
  - The migration reuses `crm_integrity_counts` for its own before/after assert.
  - RLS on `crm_fields`: select for members, write for `is_org_admin`.
  - Keep `deals.contact_id` in sync: a trigger on `deal_contacts` mirrors `is_primary` into `deals.contact_id`, and the reverse trigger upserts the primary row when `deals.contact_id` changes. Old screens keep working this way.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): configurable field storage and multi-deal contacts`

### Task 5: Change history

**Files:**
- Create: `supabase/migrations/20261104000004_crm_history.sql`
- Modify: `supabase/tests/crm_foundation/checks.sql`

**Interfaces:**
- Produces:
  - **`public.crm_history`**: `id bigserial pk`, `org_id uuid not null`, `entity text not null`, `record_id uuid not null`, `action text check in ('insert','update','delete','restore','purge')`, `changes jsonb not null` (`{column: {"from": x, "to": y}}`, full row for insert/delete), `actor uuid` (`auth.uid()`, null for service role), `at timestamptz default now()`.
    - Index on `(entity, record_id, at desc)` and `(org_id, at desc)`.
  - **RLS:** select via `is_org_member`. No insert, update or delete policy for any role; only the trigger writes.
  - **Trigger function `crm_history_capture()`**, SECURITY DEFINER, AFTER INSERT/UPDATE/DELETE FOR EACH ROW on `deals`, `companies`, `contacts`, `deal_activities`, `crm_appointments`, `deal_fees`, `deal_contacts`, `pipeline_stages`, `funnels`, `crm_fields`, `company_items`.
    - Ignores `updated_at` and `stage_updated_at`.
    - Skips updates where nothing else changed.
    - Writes `action='delete'` for soft deletes (`deleted_at` null → set) and `'restore'` for the reverse (Task 6).
- [ ] **Step 1: Failing checks.**
  - `history_update`: as u_member, update a deal title. One history row exists with `changes = {"title": {"from": old, "to": new}}` and `actor = u_member`.
  - `history_noop`: touching only `updated_at` writes nothing.
  - `history_readonly`: as u_member, `INSERT INTO crm_history` fails and `DELETE FROM crm_history` affects 0 rows.
  - `history_rls`: u_member sees no history rows of org C.
- [ ] **Step 2:** Run. Expected: FAIL at `history_update`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): change history for all CRM records`

### Task 6: Trash — soft delete everywhere, restore, admin purge

**Files:**
- Create: `supabase/migrations/20261104000005_crm_trash.sql`
- Modify: `supabase/tests/crm_foundation/checks.sql`

**Interfaces:**
- Produces:
  - **New columns** `deleted_at timestamptz`, `deleted_by uuid` and `delete_batch uuid` on `deals`, `companies`, `contacts`, `deal_activities`, `crm_appointments` and `company_items`.
  - **Trigger `crm_soft_delete()`** (BEFORE DELETE, SECURITY DEFINER):
    - when `current_setting('crm.purge', true)` is not `'on'`: set `deleted_at = now()`, `deleted_by = auth.uid()`, and `delete_batch` = existing or new uuid; then `RETURN NULL`, so the row stays;
    - cascade the same batch:
      - deal → its `deal_activities` and `crm_appointments`
      - company → its deals (and their children), `contacts` with that `company_id`, and `company_items`
  - **`deal_fees` and `deal_contacts`** keep hard deletes (history records them).
  - **RLS rewrite** for those six tables. Replace each `FOR ALL` policy with:
    - SELECT `is_org_member(auth.uid(), org_id) and deleted_at is null`
    - INSERT `with check is_org_member(...)`
    - UPDATE `using is_org_member(...) and deleted_at is null`
    - DELETE `using is_org_member(...)`
  - **RPCs**, SECURITY DEFINER, each checking membership:
    - `crm_trash_list(p_org uuid) returns table(entity text, record_id uuid, label text, deleted_at timestamptz, deleted_by uuid, delete_batch uuid, batch_size int)`. It lists batch heads only, and `label` = deal title / company name / contact name / activity body (first 80 characters).
    - `crm_restore(p_batch uuid) returns int`: clears `deleted_at`, `deleted_by` and `delete_batch` for the whole batch, and returns the rows restored.
    - `crm_purge(p_entity text, p_record_id uuid) returns int`:
      - `is_org_admin` only;
      - sets `crm.purge='on'` locally, hard-deletes the batch, and replaces the batch's `crm_history.changes` with `{"purged": true}`;
      - writes one `action='purge'` history row with no personal data.
  - **`apply_meeting_proposal`** (re-created): treats a soft-deleted deal or company as not found (`'Deal niet gevonden'`).
- [ ] **Step 1: Failing checks.**
  - `delete_is_soft`: as u_member, `DELETE` a deal. The row still exists with `deleted_at` set, and its activities and appointments share its `delete_batch`.
  - `hidden_from_select`: u_member's `SELECT` on deals no longer returns it.
  - `company_batch`: deleting a company soft-deletes its 2 deals, their children, its contacts and its `company_items`. Then `crm_restore(batch)` returns the full count and everything is visible again.
  - `purge_admin_only`: `crm_purge` as u_member raises; as u_admin it removes the rows, and the history for those records contains only `{"purged": true}` plus one purge row.
  - `counts_after_soft_delete`: `crm_integrity_counts` (which counts all rows regardless of `deleted_at`) is unchanged by a soft delete.
  - `meeting_ignores_trash`: `apply_meeting_proposal` on a soft-deleted deal returns `ok:false`.
- [ ] **Step 2:** Run. Expected: FAIL at `delete_is_soft`.
- [ ] **Step 3: Implement.** Update `crm_integrity_counts` to count every row, including soft-deleted ones.
- [ ] **Step 4:** Run both harnesses. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): trash with batch restore and admin purge`

### Task 7: Edge functions respect trash, funnels and client separation

**Files:**
- Modify: `supabase/functions/pipeline-summary/index.ts:36-43,96-104`
- Modify: `supabase/functions/meeting-analyze/index.ts` (the `fetchAll` calls)
- Modify: `supabase/functions/_shared/meetingNormalize.ts:43-48,100`
- Modify: `src/lib/meetingNormalize.test.ts`

**Interfaces:**
- Consumes: `deleted_at`, `stage_type`, `organizations.kind`.
- Produces:
  - **`pipeline-summary`** only reads deals with `deleted_at is null` whose org has `kind = 'label'`, via an inner join on organizations.
  - **`meeting-analyze`** filters `deleted_at is null` on companies and deals, and selects `stage_type` on stages.
  - **`Snapshot.stages`** items gain `stage_type`. `stageKind(stage)` reads `stage_type` and keeps the name rule only as a fallback when `stage_type` is absent.
- [ ] **Step 1: Failing test** in `meetingNormalize.test.ts`: a stage named "Deal gewonnen" with `stage_type: 'won'` counts as closed (a deal in it is not auto-bound as the single open deal).
- [ ] **Step 2:** `npx vitest run src/lib/meetingNormalize.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Bundle-check both functions with `npx esbuild <file> --bundle --platform=neutral --format=esm '--external:npm:*' '--external:https://*' --outfile=<scratch>`. Expected: no errors.
- [ ] **Step 4:** Run vitest. Expected: PASS (all 52 existing tests plus the new one).
- [ ] **Step 5: Commit** — `fix(functions): respect trash, stage types and label-only summary`

### Task 8: App uses stage types, trash page, no silent save failures

**Files:**
- Create: `src/lib/crmTypes.ts`, `src/lib/stages.ts`, `src/lib/stages.test.ts`
- Create: `src/hooks/useTrash.ts`, `src/pages/TrashPage.tsx`, `src/pages/TrashPage.test.tsx`
- Modify:
  - `src/hooks/usePipeline.ts:23-38,73-105,169-184,256-293`
  - `src/pages/DashboardPage.tsx:52-76,171-215`
  - `src/pages/FinancePage.tsx:15-50`
  - `src/hooks/useImport.ts:63-66,114-129`
  - `src/hooks/useOrganization.tsx:213-220`
  - `src/pages/SettingsPage.tsx:86-133`
  - `src/components/deal/DealOverviewTab.tsx:99`
  - `src/App.tsx`
  - `src/components/layout/AppSidebar.tsx`
  - the QueryClient setup (where `new QueryClient` is created)

**Interfaces:**
- Consumes: `stage_type`, `funnel_id`, `crm_trash_list`, `crm_restore`, `crm_purge`, `is_org_admin`.
- Produces:
  - **`src/lib/stages.ts`:**
    - `isWonStage(s: {stage_type?: string|null}): boolean`
    - `isLostStage(...)`
    - `isClosedStage(...)`
    - `outcomeEvent(from, to): 'deal.won' | 'deal.lost' | null` — `deal.won` when `to` is won and `from` isn't, `deal.lost` likewise, else null.
  - **`src/lib/crmTypes.ts`:** interfaces `Funnel`, `Stage` (with `funnel_id` and `stage_type`), `CrmField`, `TrashItem`.
  - **`useTrash()`**, **`useRestoreBatch()`**, **`usePurge()`**.
  - **Route `/prullenbak`**, with a sidebar item "Prullenbak" (`Trash2` icon) under the CRM items.
- [ ] **Step 1: Failing tests.**
  - `stages.test.ts`:
    - `isWonStage({stage_type:'won'})` is true;
    - `isWonStage({stage_type:'open', name:'Won'} as any)` is false (the name is ignored);
    - `outcomeEvent` returns `deal.won` for open→won, `null` for won→won, and `deal.lost` for open→lost.
  - `TrashPage.test.tsx` (mock `@/hooks/useTrash`):
    - it renders the item label and "Terugzetten";
    - clicking "Terugzetten" calls restore with the batch id;
    - "Definitief verwijderen" shows only when `isOrgAdmin` is true.
- [ ] **Step 2:** `npx vitest run src/lib/stages.test.ts src/pages/TrashPage.test.tsx`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - Replace every name-based won/lost rule listed in the spec's impact map with `stages.ts`:
    - `usePipeline.ts:94-95` (webhooks via `outcomeEvent`)
    - `DashboardPage.tsx:60-61,177-180`
    - `FinancePage.tsx:26-27` (keep its `won_at` fallback)
    - `useImport.ts:65-66,114-119` (the import sets `stage_id` only; the DB trigger sets `won_at`/`lost_at`)
  - `useStages` selects `stage_type, funnel_id`.
  - New-org seeding in `useOrganization.tsx` creates a funnel first and sets `stage_type`.
  - `SettingsPage`'s stage editor:
    - shows won/lost stages as fixed (rename allowed, delete disabled, with tooltip "Gewonnen en Verloren blijven altijd bestaan");
    - creates new stages with the current funnel's id.
  - `useDeleteDeal` success toast: "Verplaatst naar prullenbak".
  - Global `MutationCache({ onError })` on the QueryClient: shows a toast `Opslaan mislukt: <message>` unless the mutation sets `meta: { silent: true }`. This is the Unica lesson.
- [ ] **Step 4:** `npm test` and `npm run build`, then `npx eslint` on the changed files. Expected: all tests pass, the build is OK, and there are no new lint errors.
- [ ] **Step 5: Commit** — `feat(crm): stage types in app, trash page, global save-error toast`

### Task 9: Production rollout runbook

**Files:**
- Create: `docs/ops/2026-11-04-crm-fundament-rollout.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the runbook.** It covers:
  1. Merge `feat/meeting-voorstellen`, then this branch, to `main` only after Robin's OK.
  2. Build the push dir: remote-registered migrations plus `20261104000001`–`05` (and `20261103000001`, already applied).
     - `supabase db push --linked --dry-run` must list exactly the five new files.
     - Robin runs the real push and pastes the output. The NOTICE report lists the won/lost classification, added stages, and won deals lacking `won_at`. If the integrity check fails, the push aborts with no changes.
  3. Deploy the `meeting-analyze` and `pipeline-summary` functions.
  4. Set `organizations.kind='client'` for client orgs. None exist yet; Buitenbeleving comes in plan 5.
  5. Publish the frontend via Lovable, after checking `.env` `VITE_SUPABASE_PROJECT_ID=boxmdblzhuyfontwibdj`, then check that the live bundle contains it.
  6. Smoke test on production:
     - drag a test deal to Won and back; `won_at` is set, then cleared;
     - delete it, see it in Prullenbak, restore it.
  7. Rollback: the `crm_backup_20261104` schema keeps the pre-migration copy. Drop it only after Robin signs off (a separate, later migration).
- [ ] **Step 2: Commit** — `docs(ops): CRM foundation rollout runbook`
