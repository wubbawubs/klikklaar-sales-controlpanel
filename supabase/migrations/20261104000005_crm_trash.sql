-- CRM foundation 5/n: trash. Deletes on the six CRM record tables become soft deletes; nothing is lost by a click.
--  * deals, companies, contacts, deal_activities, crm_appointments, company_items get deleted_at / deleted_by /
--    delete_batch. A BEFORE DELETE trigger (crm_soft_delete) marks the row instead of removing it and puts
--    everything that used to go with it into the same batch:
--      deal    -> its deal_activities and crm_appointments (today's ON DELETE CASCADE children)
--      company -> its deals (+ their activities/appointments), its contacts, company_items and appointments.
--      NB: before this migration a company delete only cascaded company_items; deals, contacts and
--      crm_appointments kept living with company_id = NULL (ON DELETE SET NULL). Now they go into the company's
--      batch: restore brings them back with it, and a purge of the company removes them for good. The trash list
--      shows that breakdown (crm_trash_list.batch_counts) so the purge dialog can say so.
--    deal_fees stay attached to the trashed deal untouched. deal_fees and deal_contacts keep hard deletes (the
--    fees save path deletes + re-inserts on every save; history records those changes).
--  * RLS: trashed rows are invisible and unchangeable for app users. FOR ALL policies are split per command.
--  * crm_trash_list(org) lists batch heads, crm_restore(batch) brings a whole batch back (idempotent, only that
--    batch), crm_purge(entity, id) lets an org admin remove a trashed batch for good. Purge scrubs the history of
--    every removed record to {"purged": true}, logs one 'purge' row without personal data and returns
--    {"rows": n, "files": [storage paths]} so the app removes the documents from bucket company-documents.
--  * Guards: no live child can be added under (or moved onto, or restored under) a trashed deal/company; purge refuses
--    while live ON DELETE CASCADE children hang off the batch; a stage with deals (trashed included) cannot be
--    deleted; deleting an organization fails on purpose (fail-safe, see COMMENT ON FUNCTION crm_soft_delete).
--  * apply_meeting_proposal (definer, bypasses RLS) treats a trashed deal or a deal of a trashed company as not found.
--  * crm_integrity_counts keeps counting every row, trashed or not (no deleted_at filter, by design).
-- Data changes: none (new columns are NULL). Self-verifying: crm_integrity_counts per org identical before/after.
-- Runs in its own explicit transaction (BEGIN/COMMIT below; the Supabase CLI does not wrap files itself):
-- if anything fails, nothing of this file is applied.

BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.deals, public.companies, public.contacts, public.deal_activities, public.crm_appointments,
           public.company_items IN ACCESS EXCLUSIVE MODE;                -- ADD COLUMN, policies, trigger below
LOCK TABLE public.pipeline_stages IN SHARE ROW EXCLUSIVE MODE;          -- CREATE TRIGGER (stage guard) below

CREATE TEMP TABLE _crm_counts_before_trash ON COMMIT DROP AS
  SELECT o.id AS org_id, public.crm_integrity_counts(o.id) AS counts FROM public.organizations o;
CREATE TEMP TABLE _crm_history_before_trash ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.crm_history;

-- 1. Columns ---------------------------------------------------------------------------------------
-- deleted_by has no FK on purpose (like crm_history.actor): the trash must not depend on the user still existing.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['deals','companies','contacts','deal_activities','crm_appointments','company_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by uuid, ADD COLUMN delete_batch uuid', t);
    EXECUTE format('CREATE INDEX %I ON public.%I (delete_batch) WHERE delete_batch IS NOT NULL', t || '_delete_batch_idx', t);
    EXECUTE format('CREATE INDEX %I ON public.%I (org_id, deleted_at) WHERE deleted_at IS NOT NULL', t || '_trash_idx', t);
    EXECUTE format('COMMENT ON COLUMN public.%I.deleted_at IS %L', t,
      'Trash: set by crm_soft_delete() on DELETE; NULL = live. Rows with a value are hidden by RLS. Restore with crm_restore(delete_batch).');
    EXECUTE format('COMMENT ON COLUMN public.%I.delete_batch IS %L', t,
      'Trash: rows deleted together (e.g. a company with its deals) share one batch; crm_restore / crm_purge act per batch.');
  END LOOP;
END $$;

-- 2. Integrity counts: every row, trashed or not ------------------------------------------------------
-- Same body as before (it never filtered); re-created so the intent is documented next to the trash.
CREATE OR REPLACE FUNCTION public.crm_integrity_counts(p_org uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'deals',            (SELECT count(*) FROM public.deals WHERE org_id = p_org),
    'deals_value_sum',  (SELECT coalesce(sum(value_eur), 0) FROM public.deals WHERE org_id = p_org),
    'deals_won',        (SELECT count(*) FROM public.deals WHERE org_id = p_org AND won_at IS NOT NULL),
    'deals_lost',       (SELECT count(*) FROM public.deals WHERE org_id = p_org AND lost_at IS NOT NULL),
    'companies',        (SELECT count(*) FROM public.companies WHERE org_id = p_org),
    'contacts',         (SELECT count(*) FROM public.contacts WHERE org_id = p_org),
    'deal_activities',  (SELECT count(*) FROM public.deal_activities WHERE org_id = p_org),
    'crm_appointments', (SELECT count(*) FROM public.crm_appointments WHERE org_id = p_org),
    'deal_fees',        (SELECT count(*) FROM public.deal_fees WHERE org_id = p_org),
    'deal_fees_sum',    (SELECT coalesce(sum(amount), 0) FROM public.deal_fees WHERE org_id = p_org),
    'company_items',    (SELECT count(*) FROM public.company_items WHERE org_id = p_org),
    'stages',           (SELECT count(*) FROM public.pipeline_stages WHERE org_id = p_org)
  )
$$;
COMMENT ON FUNCTION public.crm_integrity_counts(uuid) IS
  'Ops/migration integrity counts per org. Counts every row including trashed ones (deleted_at set): a soft delete never changes these numbers, only crm_purge does.';
REVOKE ALL ON FUNCTION public.crm_integrity_counts(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Soft-delete trigger -----------------------------------------------------------------------------
-- SECURITY DEFINER: the cascade must reach every child row regardless of the caller's RLS view, and the
-- marking UPDATE must pass even though the UPDATE policy refuses deleted_at changes from app users.
-- The caller's DELETE policy has already decided that this row may go. Children are restricted to the same org.
-- crm.purge = 'on' (set only by crm_purge) lets a real DELETE through.
CREATE OR REPLACE FUNCTION public.crm_soft_delete() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_batch uuid;
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
BEGIN
  IF current_setting('crm.purge', true) = 'on' THEN
    RETURN OLD;                                   -- purge: really delete
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN NULL;                                  -- already in the trash: keep its batch, change nothing
  END IF;
  v_batch := coalesce(OLD.delete_batch, gen_random_uuid());

  EXECUTE format('UPDATE public.%I SET deleted_at = $1, deleted_by = $2, delete_batch = $3 WHERE id = $4', TG_TABLE_NAME)
    USING v_now, v_uid, v_batch, OLD.id;

  IF TG_TABLE_NAME = 'companies' THEN
    UPDATE public.deals SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE company_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.contacts SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE company_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.company_items SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE company_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.deal_activities SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE deal_id IN (SELECT id FROM public.deals WHERE delete_batch = v_batch)
        AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.crm_appointments SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE (company_id = OLD.id OR deal_id IN (SELECT id FROM public.deals WHERE delete_batch = v_batch))
        AND org_id = OLD.org_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'deals' THEN
    UPDATE public.deal_activities SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE deal_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.crm_appointments SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE deal_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
  END IF;
  RETURN NULL;                                    -- the row stays; FK cascades never fire
END $$;
REVOKE ALL ON FUNCTION public.crm_soft_delete() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.crm_soft_delete() IS
  'BEFORE DELETE on the six CRM record tables: turns a delete into a soft delete (deleted_at/by/batch) and trashes '
  'the children in the same batch; only crm_purge (crm.purge = on) really deletes. Consequence, intended (fail-safe): '
  'deleting an organization fails, because its ON DELETE CASCADE to these tables is suppressed and Postgres aborts '
  'the cascade. Organizations are never deleted by the app; CRM data must not vanish with them. '
  'SECURITY: the GUC crm.purge = on turns every delete into a real, unrecoverable delete. It is set only by '
  'crm_purge''s transaction-local set_config. Never expose set_config(''crm.purge'', ...) to clients through an RPC, a view or '
  'any SECURITY DEFINER function: that would bypass the trash, the org-admin check and the history scrub.';

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['deals','companies','contacts','deal_activities','crm_appointments','company_items'] LOOP
    EXECUTE format('CREATE TRIGGER crm_soft_delete BEFORE DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.crm_soft_delete()', t);
  END LOOP;
END $$;

-- 3b. Nothing new hangs off a trashed record --------------------------------------------------------
-- A live child of a trashed deal/company would be invisible in the trash and would be taken along by the FK
-- cascades of a purge. So: no insert of a live child under a trashed parent, no move of a live child onto a trashed
-- parent, and no restore of a child while its parent is still trashed. Plain edits of existing rows are not checked.
-- SECURITY DEFINER: the parent's trash state must be read regardless of the caller's RLS (which hides trashed rows).
CREATE OR REPLACE FUNCTION public.crm_trash_parent_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;                                   -- the row itself goes to (or stays in) the trash
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF OLD.deleted_at IS NULL
       AND v_new -> 'deal_id' IS NOT DISTINCT FROM v_old -> 'deal_id'
       AND v_new -> 'company_id' IS NOT DISTINCT FROM v_old -> 'company_id' THEN
      RETURN NEW;                                 -- ordinary edit, parent unchanged
    END IF;
  END IF;
  IF (v_new ? 'deal_id' AND EXISTS (SELECT 1 FROM public.deals
        WHERE id = (v_new ->> 'deal_id')::uuid AND deleted_at IS NOT NULL))
     OR (v_new ? 'company_id' AND EXISTS (SELECT 1 FROM public.companies
        WHERE id = (v_new ->> 'company_id')::uuid AND deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Dit item staat in de prullenbak';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.crm_trash_parent_guard() FROM PUBLIC, anon, authenticated;
-- deal_activities.deal_id, crm_appointments.deal_id/company_id, company_items.company_id, deals.company_id
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['deals','deal_activities','crm_appointments','company_items'] LOOP
    EXECUTE format('CREATE TRIGGER crm_trash_parent_guard BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.crm_trash_parent_guard()', t);
  END LOOP;
END $$;

-- 3c. A stage with deals cannot be deleted, trashed deals included ---------------------------------
-- deals.stage_id is ON DELETE SET NULL; the app's guard counts deals through RLS, which hides trashed deals,
-- so a stage delete would silently strip the stage from trashed deals.
CREATE OR REPLACE FUNCTION public.pipeline_stages_delete_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deals WHERE stage_id = OLD.id) THEN
    RAISE EXCEPTION 'Deze fase heeft nog deals (ook in de prullenbak)';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.pipeline_stages_delete_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pipeline_stages_delete_guard BEFORE DELETE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_stages_delete_guard();

-- 4. RLS: trashed rows are invisible and frozen for app users ---------------------------------------
-- DELETE needs no deleted_at condition: Postgres also applies the SELECT policy, so a trashed row cannot be hit again.
-- UPDATE's WITH CHECK keeps deleted_at NULL: trashing goes through DELETE (one batch), restoring through crm_restore.
DROP POLICY "Org members can manage deals"       ON public.deals;
DROP POLICY "Org members can manage companies"   ON public.companies;
DROP POLICY "Org members can manage contacts"    ON public.contacts;
DROP POLICY "Org members can manage activities"  ON public.deal_activities;
DROP POLICY "Org members manage appointments"    ON public.crm_appointments;
DROP POLICY "Org members manage company items"   ON public.company_items;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['deals','companies','contacts','deal_activities','crm_appointments','company_items'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                    USING (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL)', 'Members view ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL)', 'Members create ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                    USING (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL)
                    WITH CHECK (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL)', 'Members update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                    USING (public.is_org_member(auth.uid(), org_id))', 'Members delete ' || t, t);
  END LOOP;
END $$;

-- 5. Trash RPCs -----------------------------------------------------------------------------------------
-- Batch head = the row the user deleted: company before deal before anything else (a batch never holds two
-- rows of the same rank at the top, because every DELETE of a row starts its own batch).
CREATE OR REPLACE FUNCTION public.crm_trash_list(p_org uuid)
RETURNS TABLE(entity text, record_id uuid, label text, deleted_at timestamptz, deleted_by uuid, delete_batch uuid, batch_size int,
              batch_counts jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), p_org) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;
  RETURN QUERY
  WITH t AS (
    SELECT 'companies'::text AS ent, 1 AS rnk, x.id, x.name AS lbl, x.deleted_at AS dat, x.deleted_by AS dby, x.delete_batch AS bat
      FROM public.companies x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'deals', 2, x.id, x.title, x.deleted_at, x.deleted_by, x.delete_batch
      FROM public.deals x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'contacts', 3, x.id, x.name, x.deleted_at, x.deleted_by, x.delete_batch
      FROM public.contacts x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'deal_activities', 3, x.id, coalesce(x.body, x.type), x.deleted_at, x.deleted_by, x.delete_batch
      FROM public.deal_activities x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'crm_appointments', 3, x.id, x.title, x.deleted_at, x.deleted_by, x.delete_batch
      FROM public.crm_appointments x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
    UNION ALL
    SELECT 'company_items', 3, x.id, coalesce(x.title, x.file_name, x.item_type), x.deleted_at, x.deleted_by, x.delete_batch
      FROM public.company_items x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
  ), ranked AS (
    SELECT t.*, count(*) OVER (PARTITION BY coalesce(t.bat, t.id)) AS n,
           row_number() OVER (PARTITION BY coalesce(t.bat, t.id) ORDER BY t.rnk, t.dat, t.id) AS rn
    FROM t
  ), per AS (                                   -- rows per entity per batch
    SELECT coalesce(t.bat, t.id) AS k, t.ent, count(*) AS c FROM t GROUP BY 1, 2
  ), fees AS (                                  -- deal_fees have no trash state, but a purge of their deal removes them
    SELECT coalesce(d.delete_batch, d.id) AS k, count(*) AS c
    FROM public.deal_fees f JOIN public.deals d ON d.id = f.deal_id
    WHERE d.org_id = p_org AND d.deleted_at IS NOT NULL GROUP BY 1
  )
  SELECT r.ent, r.id, left(r.lbl, 80), r.dat, r.dby, r.bat, r.n::int,
         -- what the batch holds besides its head, e.g. {"deals": 3, "contacts": 2, "company_items": 1}
         coalesce((SELECT jsonb_object_agg(p.ent, p.c - (p.ent = r.ent)::int) FROM per p
                   WHERE p.k = coalesce(r.bat, r.id) AND p.c - (p.ent = r.ent)::int > 0), '{}'::jsonb)
         || coalesce((SELECT jsonb_build_object('deal_fees', f.c) FROM fees f WHERE f.k = coalesce(r.bat, r.id)), '{}'::jsonb)
  FROM ranked r WHERE r.rn = 1
  ORDER BY r.dat DESC, r.id;
END $$;
REVOKE ALL ON FUNCTION public.crm_trash_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_trash_list(uuid) TO authenticated, service_role;

-- Restores exactly the rows of p_batch (never another batch) and returns how many. Unknown/already restored -> 0.
CREATE OR REPLACE FUNCTION public.crm_restore(p_batch uuid) RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_n   int := 0;
  v_c   int;
  t     text;
BEGIN
  IF p_batch IS NULL THEN RETURN 0; END IF;
  SELECT s.org_id INTO v_org FROM (
    SELECT org_id FROM public.companies WHERE delete_batch = p_batch
    UNION ALL SELECT org_id FROM public.deals WHERE delete_batch = p_batch
    UNION ALL SELECT org_id FROM public.contacts WHERE delete_batch = p_batch
    UNION ALL SELECT org_id FROM public.deal_activities WHERE delete_batch = p_batch
    UNION ALL SELECT org_id FROM public.crm_appointments WHERE delete_batch = p_batch
    UNION ALL SELECT org_id FROM public.company_items WHERE delete_batch = p_batch
  ) s LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;
  FOREACH t IN ARRAY ARRAY['companies','deals','contacts','deal_activities','crm_appointments','company_items'] LOOP
    EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL, delete_batch = NULL
                    WHERE delete_batch = $1 AND org_id = $2', t) USING p_batch, v_org;
    GET DIAGNOSTICS v_c = ROW_COUNT;
    v_n := v_n + v_c;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.crm_restore(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_restore(uuid) TO authenticated, service_role;

-- Permanently removes the trashed batch of (p_entity, p_record_id). Org admins only.
-- crm.purge is 'on' only while this function runs: set_config(..., true) after the access checks, reset before RETURN;
-- transaction-local, so an error rolls it back too. (A function-level SET crm.purge is denied for role postgres on
-- Supabase: supautils only allows listed placeholders there, so the CLI/db push would fail.)
-- History: every row about a removed record (incl. the full-row 'delete' rows the capture trigger writes during
-- this purge, and rows of FK-cascaded children such as deal_fees) becomes {"purged": true}; then one 'purge' row
-- on the batch head with only the row count.
-- Returns {"rows": <rows of the batch removed>, "files": [<storage_path of every removed company_item>]}. The database
-- cannot reach Storage; the app removes those files from bucket company-documents after a successful purge.
CREATE OR REPLACE FUNCTION public.crm_purge(p_entity text, p_record_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_batch     uuid;
  v_deleted   timestamptz;
  v_companies uuid[];
  v_deals     uuid[];
  v_contacts  uuid[];
  v_acts      uuid[];
  v_appts     uuid[];
  v_items     uuid[];
  v_fees      uuid[];
  v_files     text[];
  v_n         int := 0;
  v_c         int;
BEGIN
  IF p_entity IS NULL OR p_entity NOT IN ('deals','companies','contacts','deal_activities','crm_appointments','company_items') THEN
    RAISE EXCEPTION 'Onbekend type: %', p_entity;
  END IF;
  EXECUTE format('SELECT org_id, delete_batch, deleted_at FROM public.%I WHERE id = $1', p_entity)
    INTO v_org, v_batch, v_deleted USING p_record_id;
  -- Same message for "does not exist" and "not your org": non-admins learn nothing about the record.
  IF v_uid IS NULL OR v_org IS NULL OR NOT public.is_org_admin(v_uid, v_org) THEN RAISE EXCEPTION 'Geen toegang'; END IF;
  IF v_deleted IS NULL OR v_batch IS NULL THEN RAISE EXCEPTION 'Niet gevonden in de prullenbak'; END IF;

  PERFORM set_config('crm.purge', 'on', true);

  -- Everything that disappears: the batch, plus whatever FK cascades take along with its deals/companies.
  v_companies := ARRAY(SELECT id FROM public.companies WHERE delete_batch = v_batch FOR UPDATE);
  v_deals     := ARRAY(SELECT id FROM public.deals WHERE delete_batch = v_batch FOR UPDATE);
  v_contacts  := ARRAY(SELECT id FROM public.contacts WHERE delete_batch = v_batch FOR UPDATE);
  v_acts      := ARRAY(SELECT id FROM public.deal_activities WHERE delete_batch = v_batch OR deal_id = ANY (v_deals));
  v_appts     := ARRAY(SELECT id FROM public.crm_appointments WHERE delete_batch = v_batch OR deal_id = ANY (v_deals));
  v_items     := ARRAY(SELECT id FROM public.company_items WHERE delete_batch = v_batch OR company_id = ANY (v_companies));
  v_fees      := ARRAY(SELECT id FROM public.deal_fees WHERE deal_id = ANY (v_deals));

  -- Never take live data along: every ON DELETE CASCADE child with a trash state (deal_activities and
  -- crm_appointments via deal_id, company_items via company_id) must itself be in the trash. deal_fees and
  -- deal_contacts have no trash state; they belong to the deal / the contact link and go with it.
  IF EXISTS (SELECT 1 FROM public.deal_activities  WHERE deal_id = ANY (v_deals) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.crm_appointments WHERE deal_id = ANY (v_deals) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.company_items    WHERE company_id = ANY (v_companies) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Er hangen nog actieve gegevens aan dit item; zet die eerst in de prullenbak';
  END IF;

  -- Files of every company_item that disappears (its own batch or taken along by the company FK cascade).
  v_files := ARRAY(SELECT storage_path FROM public.company_items
                   WHERE id = ANY (v_items) AND storage_path IS NOT NULL ORDER BY storage_path);

  DELETE FROM public.deal_activities  WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;
  DELETE FROM public.crm_appointments WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;
  DELETE FROM public.company_items    WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;
  DELETE FROM public.deals            WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;
  DELETE FROM public.contacts         WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;
  DELETE FROM public.companies        WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;

  UPDATE public.crm_history SET changes = '{"purged": true}'::jsonb
  WHERE (entity = 'companies'        AND record_id = ANY (v_companies))
     OR (entity IN ('deals','deal_contacts') AND record_id = ANY (v_deals))
     OR (entity = 'contacts'         AND record_id = ANY (v_contacts))
     OR (entity = 'deal_activities'  AND record_id = ANY (v_acts))
     OR (entity = 'crm_appointments' AND record_id = ANY (v_appts))
     OR (entity = 'company_items'    AND record_id = ANY (v_items))
     OR (entity = 'deal_fees'        AND record_id = ANY (v_fees))
     -- links of purged contacts to other deals (role is free text); update diffs hold contact_id as {from, to}
     OR (entity = 'deal_contacts' AND (changes ->> 'contact_id' = ANY (v_contacts::text[])
                                       OR changes -> 'contact_id' ->> 'from' = ANY (v_contacts::text[])
                                       OR changes -> 'contact_id' ->> 'to'   = ANY (v_contacts::text[])));

  INSERT INTO public.crm_history (org_id, entity, record_id, action, changes, actor)
  VALUES (v_org, p_entity, p_record_id, 'purge', jsonb_build_object('purged', true, 'rows', v_n), v_uid);
  PERFORM set_config('crm.purge', 'off', true);
  RETURN jsonb_build_object('rows', v_n, 'files', to_jsonb(v_files));
END $$;
REVOKE ALL ON FUNCTION public.crm_purge(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_purge(text, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.crm_purge(text, uuid) IS
  'Org admins: permanently removes one trashed batch, scrubs its history, returns {"rows": n, "files": [storage paths]}; '
  'the caller removes those files from bucket company-documents. It sets the GUC crm.purge = on for its own duration '
  '(function-level SET), which makes crm_soft_delete let deletes through. SECURITY: never expose '
  'set_config(''crm.purge'', ...) to clients through an RPC, a view or any SECURITY DEFINER function.';

-- 6. apply_meeting_proposal: trashed deal / company = not found (otherwise identical to 20261104000002) ----
CREATE OR REPLACE FUNCTION public.apply_meeting_proposal(p_proposal_id uuid, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prop meeting_proposals%ROWTYPE;
  v_imp meeting_imports%ROWTYPE;
  v_payload jsonb := coalesce(p_input->'payload', '{}'::jsonb);
  v_company_id uuid := nullif(p_input->>'company_id', '')::uuid;
  v_deal_id uuid := nullif(p_input->>'deal_id', '')::uuid;
  v_confirm boolean := coalesce((p_input->>'confirm_closed')::boolean, false);
  v_exp jsonb;
  v_deal deals%ROWTYPE;
  v_after deals%ROWTYPE;
  v_from_stage pipeline_stages%ROWTYPE;
  v_to_stage pipeline_stages%ROWTYPE;
  v_from_kind text;
  v_to_kind text;
  v_suffix text;
  v_meta jsonb;
  v_events jsonb := '[]'::jsonb;
  v_before jsonb;
  v_after_json jsonb;
  v_text text;
  v_num numeric;
  v_user uuid;
  v_name text;
  v_appt crm_appointments%ROWTYPE;
  v_new_company uuid;
  v_new_contact uuid;
  v_err text;
BEGIN
  SELECT * INTO v_prop FROM meeting_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voorstel niet gevonden'; END IF;
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_organizations WHERE user_id = v_uid AND organization_id = v_prop.org_id
  ) THEN RAISE EXCEPTION 'Geen toegang'; END IF;
  IF v_prop.status = 'applied' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dit voorstel is al toegepast');
  END IF;

  SELECT * INTO v_imp FROM meeting_imports WHERE id = v_prop.import_id;
  IF v_imp.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Deze meeting wordt opnieuw geanalyseerd — wacht tot dat klaar is');
  END IF;
  v_suffix := ' (uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || ')';
  v_meta := jsonb_build_object('source', 'meeting', 'meeting_import_id', v_prop.import_id, 'proposal_id', v_prop.id);

  BEGIN
    IF v_prop.kind <> 'new_deal' THEN
      SELECT * INTO v_deal FROM deals WHERE id = v_deal_id AND org_id = v_prop.org_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Kies een deal'; END IF;
      -- Runs as definer, so RLS does not hide the trash: a trashed deal, or a deal of a trashed company, is not found.
      IF v_deal.deleted_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM companies WHERE id = v_deal.company_id AND deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Deal niet gevonden';
      END IF;
      IF v_company_id IS NOT NULL AND v_deal.company_id IS DISTINCT FROM v_company_id THEN
        RAISE EXCEPTION 'Kies een deal';
      END IF;
      v_before := to_jsonb(v_deal);

      -- Stale check on the field this kind changes.
      -- The analysis snapshot only applies to the deal the AI picked; for a deal chosen by the user, use what the screen showed.
      v_exp := CASE WHEN v_prop.deal_id IS NOT DISTINCT FROM v_deal.id AND v_prop.expected IS NOT NULL
                    THEN v_prop.expected ELSE p_input->'expected' END;
      IF v_exp IS NOT NULL AND (
           (v_prop.kind IN ('stage','won','lost') AND v_deal.stage_id IS DISTINCT FROM nullif(v_exp->>'stage_id','')::uuid)
        OR (v_prop.kind = 'value' AND v_deal.value_eur IS DISTINCT FROM nullif(v_exp->>'value_eur','')::numeric)
        OR (v_prop.kind = 'owner' AND v_deal.assigned_to IS DISTINCT FROM nullif(v_exp->>'assigned_to','')::uuid)
      ) THEN
        RAISE EXCEPTION 'Deal is sinds de analyse gewijzigd — controleer en doe dit handmatig';
      END IF;

      SELECT * INTO v_from_stage FROM pipeline_stages WHERE id = v_deal.stage_id;
      v_from_kind := CASE v_from_stage.stage_type WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' END;
      IF v_prop.kind IN ('stage','won','lost') AND v_from_kind IS NOT NULL AND NOT v_confirm THEN
        RAISE EXCEPTION 'Deal is al gewonnen of verloren — bevestig eerst';
      END IF;
    END IF;

    IF v_prop.kind IN ('stage','won','lost') THEN
      IF v_prop.kind = 'stage' THEN
        SELECT * INTO v_to_stage FROM pipeline_stages
          WHERE id = nullif(v_payload->>'stage_id','')::uuid AND org_id = v_prop.org_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Kies een fase'; END IF;
      ELSE
        SELECT * INTO v_to_stage FROM pipeline_stages
          WHERE funnel_id = v_deal.funnel_id AND org_id = v_prop.org_id
            AND stage_type = CASE WHEN v_prop.kind = 'won' THEN 'won' ELSE 'lost' END
          ORDER BY position LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION '%', CASE WHEN v_prop.kind = 'won' THEN 'Geen gewonnen-fase gevonden' ELSE 'Geen verloren-fase gevonden' END;
        END IF;
      END IF;
      v_to_kind := CASE v_to_stage.stage_type WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' END;

      -- won_at/lost_at below are also maintained by trigger deals_sync_outcome; it keeps these explicit values
      -- (coalesce), so the result is the same as before the trigger existed.
      UPDATE deals SET
        stage_id = v_to_stage.id,
        stage_updated_at = now(),
        won_at = CASE WHEN v_to_kind = 'won' THEN now() ELSE NULL END,
        lost_at = CASE WHEN v_to_kind = 'lost' THEN now() ELSE NULL END,
        lost_reason = CASE WHEN v_to_kind = 'lost' THEN nullif(trim(coalesce(v_payload->>'lost_reason', '')), '') ELSE NULL END
      WHERE id = v_deal.id RETURNING * INTO v_after;

      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'stage_change',
        'Verplaatst van "' || coalesce(v_from_stage.name, '—') || '" naar "' || v_to_stage.name || '"' || v_suffix
          || CASE WHEN v_to_kind = 'lost' AND v_after.lost_reason IS NOT NULL THEN ' — reden: ' || v_after.lost_reason ELSE '' END,
        v_meta || jsonb_build_object('from_stage', v_from_stage.name, 'to_stage', v_to_stage.name), v_uid);

      v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.stage_changed', 'payload',
        jsonb_build_object('deal_id', v_deal.id, 'from_stage', v_from_stage.name, 'to_stage', v_to_stage.name)));
      IF v_to_kind = 'won' THEN
        v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.won', 'payload', jsonb_build_object('deal_id', v_deal.id)));
      ELSIF v_to_kind = 'lost' THEN
        v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.lost', 'payload', jsonb_build_object('deal_id', v_deal.id)));
      END IF;
      v_after_json := to_jsonb(v_after);

    ELSIF v_prop.kind = 'value' THEN
      v_num := nullif(v_payload->>'value_eur', '')::numeric;
      IF v_num IS NULL OR v_num <= 0 THEN RAISE EXCEPTION 'Vul een bedrag in'; END IF;
      UPDATE deals SET value_eur = v_num WHERE id = v_deal.id RETURNING * INTO v_after;
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'note',
        'Waarde aangepast van ' || coalesce('€' || v_deal.value_eur::text, '—') || ' naar €' || v_num::text || v_suffix, v_meta, v_uid);
      v_after_json := to_jsonb(v_after);

    ELSIF v_prop.kind = 'owner' THEN
      v_user := nullif(v_payload->>'user_id', '')::uuid;
      IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM user_organizations WHERE user_id = v_user AND organization_id = v_prop.org_id) THEN
        RAISE EXCEPTION 'Kies een eigenaar';
      END IF;
      SELECT coalesce(full_name, email, 'onbekend') INTO v_name FROM profiles WHERE user_id = v_user;
      UPDATE deals SET assigned_to = v_user WHERE id = v_deal.id RETURNING * INTO v_after;
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'note', 'Eigenaar gewijzigd naar ' || coalesce(v_name, 'onbekend') || v_suffix, v_meta, v_uid);
      v_after_json := to_jsonb(v_after);

    ELSIF v_prop.kind = 'note' THEN
      v_text := nullif(trim(coalesce(v_payload->>'body', '')), '');
      IF v_text IS NULL THEN RAISE EXCEPTION 'Notitie is leeg'; END IF;
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'note',
        'Uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || ': ' || v_text, v_meta, v_uid);
      v_after_json := v_before;

    ELSIF v_prop.kind = 'appointment' THEN
      v_user := nullif(v_payload->>'user_id', '')::uuid;
      IF coalesce(v_payload->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Kies een datum'; END IF;
      IF coalesce(v_payload->>'time', '') !~ '^\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Vul een tijd in'; END IF;
      IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM user_organizations WHERE user_id = v_user AND organization_id = v_prop.org_id) THEN
        RAISE EXCEPTION 'Kies een eigenaar';
      END IF;
      INSERT INTO crm_appointments (org_id, deal_id, company_id, contact_id, owner_id, type, title, starts_at, notes, created_by)
      VALUES (v_prop.org_id, v_deal.id, v_deal.company_id, v_deal.contact_id, v_user,
        CASE WHEN v_payload->>'appointment_type' = 'meeting' THEN 'meeting' ELSE 'call' END,
        coalesce(nullif(trim(coalesce(v_payload->>'title', '')), ''), 'Opvolging'),
        ((v_payload->>'date') || ' ' || (v_payload->>'time'))::timestamp AT TIME ZONE 'Europe/Amsterdam',
        'Uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || coalesce(': ' || nullif(v_prop.quote, ''), ''),
        v_uid)
      RETURNING * INTO v_appt;
      v_after_json := to_jsonb(v_appt);

    ELSIF v_prop.kind = 'new_deal' THEN
      IF nullif(trim(coalesce(v_payload->>'company_name', '')), '') IS NULL THEN RAISE EXCEPTION 'Vul een bedrijfsnaam in'; END IF;
      IF nullif(trim(coalesce(v_payload->>'deal_title', '')), '') IS NULL THEN RAISE EXCEPTION 'Vul een dealnaam in'; END IF;
      SELECT * INTO v_to_stage FROM pipeline_stages
        WHERE id = nullif(v_payload->>'stage_id','')::uuid AND org_id = v_prop.org_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Kies een fase'; END IF;
      v_num := nullif(v_payload->>'value_eur', '')::numeric;
      IF v_num IS NOT NULL AND v_num <= 0 THEN v_num := NULL; END IF;

      INSERT INTO companies (org_id, name, source)
      VALUES (v_prop.org_id, trim(v_payload->>'company_name'), 'sales-meeting')
      RETURNING id INTO v_new_company;
      IF nullif(trim(coalesce(v_payload->>'contact_name', '')), '') IS NOT NULL THEN
        INSERT INTO contacts (org_id, company_id, name) VALUES (v_prop.org_id, v_new_company, trim(v_payload->>'contact_name'))
        RETURNING id INTO v_new_contact;
      END IF;
      INSERT INTO deals (org_id, company_id, contact_id, stage_id, title, value_eur, assigned_to, created_by)
      VALUES (v_prop.org_id, v_new_company, v_new_contact, v_to_stage.id, trim(v_payload->>'deal_title'), v_num, v_uid, v_uid)
      RETURNING * INTO v_after;
      v_deal := v_after;
      v_company_id := v_new_company;
      v_text := nullif(trim(coalesce(v_payload->>'body', '')), '');
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_after.id, 'note',
        'Aangemaakt uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || coalesce(': ' || v_text, ''), v_meta, v_uid);
      v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.created', 'payload',
        jsonb_build_object('deal_id', v_after.id, 'title', v_after.title)));
      v_before := NULL;
      v_after_json := to_jsonb(v_after);
    END IF;

    INSERT INTO audit_logs (actor_user_id, action_type, entity_type, entity_id, before_json, after_json)
    VALUES (v_uid, 'meeting_proposal.' || v_prop.kind,
      CASE WHEN v_prop.kind = 'appointment' THEN 'crm_appointment' ELSE 'deal' END,
      CASE WHEN v_prop.kind = 'appointment' THEN v_appt.id::text ELSE v_deal.id::text END,
      v_before, v_after_json);

    UPDATE meeting_proposals SET
      status = 'applied', applied_at = now(), applied_by = v_uid, error = NULL,
      payload = v_payload, deal_id = v_deal.id, company_id = coalesce(v_company_id, v_deal.company_id)
    WHERE id = v_prop.id;

    RETURN jsonb_build_object('ok', true, 'deal_id', v_deal.id, 'events', v_events);
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    UPDATE meeting_proposals SET status = 'failed', error = v_err WHERE id = v_prop.id;
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_meeting_proposal(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_meeting_proposal(uuid, jsonb) TO authenticated;

-- 7. Verify ------------------------------------------------------------------------------------------
DO $$ DECLARE r record; v_after jsonb; t text; BEGIN
  FOR r IN SELECT * FROM _crm_counts_before_trash LOOP
    v_after := public.crm_integrity_counts(r.org_id);
    IF r.counts IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'Integriteitscontrole mislukt voor org %: voor=% na=%', r.org_id, r.counts, v_after;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.organizations) <> (SELECT count(*) FROM _crm_counts_before_trash) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: aantal organisaties veranderd';
  END IF;
  IF (SELECT count(*) FROM public.crm_history) <> (SELECT n FROM _crm_history_before_trash) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: migratie schreef historie (geen datawijziging verwacht)';
  END IF;
  FOREACH t IN ARRAY ARRAY['deals','companies','contacts','deal_activities','crm_appointments','company_items'] LOOP
    EXECUTE format('SELECT 1 FROM public.%I WHERE deleted_at IS NOT NULL OR deleted_by IS NOT NULL OR delete_batch IS NOT NULL LIMIT 1', t) INTO r;
    IF r IS NOT NULL THEN RAISE EXCEPTION 'Integriteitscontrole mislukt: % heeft al rijen in de prullenbak', t; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'crm_soft_delete' AND tgfoid = 'public.crm_soft_delete()'::regprocedure) <> 6 THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: prullenbak-trigger niet op alle 6 tabellen';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'crm_trash_parent_guard') <> 4
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pipeline_stages_delete_guard') THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: prullenbak-guards ontbreken';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND cmd = 'ALL'
             AND tablename IN ('deals','companies','contacts','deal_activities','crm_appointments','company_items'))
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
         AND tablename IN ('deals','companies','contacts','deal_activities','crm_appointments','company_items')) <> 24 THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: onverwachte RLS-policies op de prullenbak-tabellen';
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '=== CRM prullenbak migratie-rapport ===';
  RAISE NOTICE 'soft delete actief op 6 tabellen (deals, companies, contacts, deal_activities, crm_appointments, company_items)';
  RAISE NOTICE 'geen bestaande data gewijzigd; integriteitstellingen per org gelijk';
END $$;

COMMIT;
