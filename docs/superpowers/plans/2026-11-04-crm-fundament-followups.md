# Plan 1 (CRM foundation): rulings and deferred items

Written down when plan 1 was finished (4 Nov 2026), so these decisions and open points survive. Picked up by plans 2–6.

## Rulings made during the build
- Ruling: T5 history trigger detects soft delete/restore generically (deleted_at key present in old/new row JSON and transitions null↔set); T5 adds no deleted_at columns itself; the soft-delete/restore history check is added in T6 — keeps tasks ordered, cost if wrong: one extra check in T6.
- Ruling: T3 may modify supabase/tests/meeting_apply/stub_schema.sql (and fixtures) to add funnels/stage_type — the plan's Step 3 requires it; cost if wrong: none.
- Ruling: crm_integrity_counts is SECURITY DEFINER, revoked from public/anon/authenticated (migration-only tool) — counts must not depend on caller RLS; cost if wrong: Robin can't call it from the app (not needed).
- Ruling: is_org_admin must also count user_organizations.role='owner' (org creators get 'owner'; an owner who can't configure their own CRM contradicts spec goal 7) — cost if wrong: owners gain config rights, which the spec wants anyway.
- Ruling: outcome trigger clearing won_at/lost_at when a deal enters an open stage stands (consistency over caller input); Task 8 import must map won/lost via stage_type so historical won deals keep won_at — cost if wrong: imports into untyped stages lose won_at.
- Ruling: existing deals whose contact_id points to another org's contact must NOT abort the migration — skip their deal_contacts row, leave deals.contact_id untouched, and RAISE NOTICE the deal ids; new cross-org links stay rejected — cost if wrong: a few legacy links not mirrored into deal_contacts until fixed by hand.
- Ruling: old-screen contact change keeps the previous contact linked as non-primary (no data dropped) — accepted.
- Ruling: crm_purge scrubs crm_history only; copies in crm_backup_20261104 (temporary, dropped after sign-off), audit_logs and meeting_proposals quotes are out of scope for plan 1 — document in runbook — cost if wrong: a privacy request needs a manual scrub of those three places.
- Ruling: migration 5 asserting exactly 24 policies on the six tables stands — it fails safe (push aborts, nothing changes) if prod drifted — cost if wrong: one re-dump and adjust before pushing.
- Ruling: deleting an organization fails by design once soft delete is in place (no app path deletes orgs; data must not vanish) — documented via COMMENT + check — cost if wrong: ops must purge an org's CRM data explicitly before removing the org.
- Ruling: client-side stage_type migration of the meeting callers belongs to Task 8 (which replaces all name-based won/lost rules in src/ and makes useStages select stage_type); Task 8 also drops the stageKind string overload and adds tests for open-named-"Won" and lost-type stages — cost if wrong: none, Task 8 is the next task.
- Ruling: purge leaving storage files (Important, flagged as follow-up by reviewer) is carried to the final whole-branch review fix wave rather than a Task 8 fix round — it spans the Task 6 RPC and the client — cost if wrong: orphaned files in company-documents until fixed.

## Deferred minor items
- Task 1: minor (deferred): no smoke check that SET ROLE authenticated can read tables under RLS (checks.sql:2-4) — carried into Task 2 dispatch
- Task 1: minor (deferred): checks are autocommitted DO blocks; destructive checks must restore/rollback or later counts become order-dependent — carried into dispatches
- Task 1: minor (deferred): dump regeneration depends on old push dir path; partial dump file could be treated as valid (run.sh:8,15-17)
- Task 1: minor (deferred): docker stop slow; schema-load errors only counted
- Task 2: minor (deferred): moving a stage to another funnel (UPDATE pipeline_stages.funnel_id) not guarded — needed when stage-move UI arrives (plan 4)
- Task 2: minor (deferred): deal insert without stage into org with no funnel gives raw NOT NULL error
- Task 2: minor (deferred): stage_funnel_match check proves cross-funnel only via cross-org
- Task 2: minor (deferred): ACCESS EXCLUSIVE on organizations blocks reads during push — runbook: push at a quiet moment
- Task 3: minor (deferred): lost→open move keeps lost_reason (UI tasks should clear/hide)
- Task 3: minor (deferred): meeting stub lacks deals_stage_in_funnel, cross-funnel RPC error path untested there
- Task 4: minor (deferred): choice built-ins seeded with empty options; UI must source billing_type options from billing_types (plan 2/4)
- Task 4: minor (deferred): legacy cross-org deals have contact_id but no deal_contacts row — UI reading only deal_contacts won't show them (runbook: list from NOTICE)
- Task 5: minor (deferred → carried into Task 6 dispatch): some history checks pass when nothing captured (SELECT INTO without NOT FOUND; <> vs IS DISTINCT FROM)
- Task 5: minor (deferred): to_jsonb computed twice on insert/delete
- Task 5: minor (deferred): deals.contact_id change writes history on both deals and deal_contacts (history UI should expect)
- Task 5: minor (deferred): org deletion / hard delete leaves personal data in crm_history (known gap; purge handled in Task 6)
- Task 5: minor (deferred): service-role writes have null actor; fee history needs index on changes->>'deal_id' when UI needs it
- Task 6: minor (deferred): purge locks only part of the batch (harmless due to batch re-check)
- Task 6: minor (deferred): occasional harness flake loading live schema ("could not open relation with OID") — passes on retry
- Task 8: minor (deferred): purge of company_items leaves storage files in company-documents bucket (needs server-side cleanup later)
- Task 8: minor (deferred): seeded won stage named 'Won' (English) — prefer 'Gewonnen'
- Task 8: minor (deferred): importStage and SettingsPage ignore funnels (fine with one funnel per org; needs funnel param in plan 4)
- Task 8: minor (deferred): useTrash.test doesn't use createQueryClient so no double-toast proof
- Task 8: minor (deferred): TrashPage isPending disables all rows
- Task 9: minor (deferred → final fix wave): runbook line 10 stale remote-history wording + add `supabase migration list --linked`; .env line shown without quotes; lock description should mention SHARE locks on 6 tables; quote exact stage-delete + restore error texts
- Final: minor (deferred): leftover-files toast disappears after ~4s (use duration Infinity)
- Final: minor (deferred): purge dialog undercounts rows from other trash batches removed by FK cascade
- Final: minor (deferred): runbook step 0 — db dump needs Docker + DB password
- Final: minor (deferred): runbook omits migration 5 SHARE ROW EXCLUSIVE on pipeline_stages and two updated_at triggers
- Final: minor (deferred): concurrent first deal inserts can create two funnels (rare race, same as stage trigger)

## Notes carried forward
- Task 3: note: apply_meeting_proposal soft-delete handling deferred to Task 6 per plan.
- Task 3: note (for rollout runbook): existing user_organizations role='admin' rows (incl. prod demo-seed user) become client admins
- Task 5: carry to Task 6: crm_history.entity holds table names (deals/companies/contacts...) — Task 6 RPCs must map; purge must overwrite/skip full-row delete history written by the capture trigger; deal_contacts record_id = deal_id.
- Task 6: carry to Task 8: useDeleteCompanyItem must not remove the storage file on (soft) delete — only purge may; useDeleteStage guard should rely on the new DB guard error; restoring a deal while its company is still trashed shows an orphaned deal (UI hint).
- Task 6: carry to Task 8: useDeleteStage should surface the DB error message ('Deze fase heeft nog deals (ook in de prullenbak)'); trash page restore can raise 'Dit item staat in de prullenbak' when parent batch still trashed — show that message.

## After local CLI test (4 Nov 2026)
- Fixed: the Supabase CLI does not wrap migration files in a transaction — migrations now have explicit BEGIN;/COMMIT; and the harnesses apply files without `psql -1` (commit e91a22c).
- Fixed: function-level `SET crm.purge` is not allowed for the non-superuser `postgres` role on Supabase — crm_purge now uses transaction-local set_config (commit e91a22c, reviewed: approved).
- To do (minor): COMMENT ON FUNCTION crm_purge in migration 5 still says "(function-level SET)" — reword.
- To do (minor): add harness checks `purge_no_function_level_guc` (no public function has a proconfig entry LIKE 'crm.%') and `purge_resets_guc` (as org admin: purge succeeds, crm.purge is not 'on' afterwards, a following DELETE in the same transaction is still soft) — the harness runs as superuser and missed this bug class.
- To check (ops): confirm in the Supabase dashboard that the production API exposes only the public schema (not pg_catalog).
