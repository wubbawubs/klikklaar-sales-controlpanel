-- CRM plan 3, 1/n: tasks (crm_tasks) with the same safety net as the other CRM records.
--  * crm_tasks: a to-do (call / email / todo) for an org, optionally linked to a deal, company and/or contact.
--    due_date is a plain date (no timezone); due_time is optional.
--  * crm_tasks_completion: status -> 'done' fills completed_at / completed_by (kept if already set); any other
--    status clears both. completed_* cannot be set by hand on a task that is not done.
--  * crm_tasks_links_guard: a linked deal / company / contact must belong to the task's org and must not be in the
--    trash (checked on insert, on a link or org change, and on restore; ordinary edits are not checked).
--  * History (crm_history_capture) and trash (crm_soft_delete) as on the other CRM tables, RLS per command.
--  * Trash: trashing a deal takes its live tasks into the same batch; trashing a company takes the tasks of the
--    company, of its deals and of its contacts. crm_trash_list shows tasks as entity 'crm_tasks' (label = title)
--    and counts them in batch_counts; crm_restore restores them after their parents; crm_purge removes and scrubs
--    them, and refuses while a live task still links to a deal / company / contact of the batch.
--  * crm_integrity_counts gains key crm_tasks (every row, trashed or not).
-- Data changes: none (new table is empty). Self-verifying: crm_integrity_counts per org identical before/after
-- (ignoring the new key crm_tasks), no history written.
-- Runs in its own explicit transaction (BEGIN/COMMIT below; the Supabase CLI does not wrap files itself):
-- if anything fails, nothing of this file is applied.

BEGIN;
SET LOCAL lock_timeout = '5s';
-- FKs from the new table + replaced trash functions: no concurrent writes/deletes on the parents meanwhile.
LOCK TABLE public.organizations, public.deals, public.companies, public.contacts IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _crm_counts_before_tasks ON COMMIT DROP AS
  SELECT o.id AS org_id, public.crm_integrity_counts(o.id) AS counts FROM public.organizations o;
CREATE TEMP TABLE _crm_history_before_tasks ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.crm_history;

-- 1. Table -----------------------------------------------------------------------------------------
-- completed_by / created_by / deleted_by have no FK on purpose (like crm_history.actor).
CREATE TABLE public.crm_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (length(trim(title)) > 0),
  notes        text,
  type         text NOT NULL DEFAULT 'todo'   CHECK (type IN ('call','email','todo')),
  priority     text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status       text NOT NULL DEFAULT 'open'   CHECK (status IN ('open','in_progress','waiting','done','cancelled')),
  due_date     date,
  due_time     time,
  owner_id     uuid REFERENCES auth.users(id),
  deal_id      uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id   uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id   uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  deleted_by   uuid,
  delete_batch uuid
);
CREATE INDEX crm_tasks_org_status_due_idx   ON public.crm_tasks (org_id, status, due_date);
CREATE INDEX crm_tasks_owner_status_due_idx ON public.crm_tasks (owner_id, status, due_date);
CREATE INDEX crm_tasks_deal_idx             ON public.crm_tasks (deal_id);
CREATE INDEX crm_tasks_company_idx          ON public.crm_tasks (company_id);
CREATE INDEX crm_tasks_contact_idx          ON public.crm_tasks (contact_id);
CREATE INDEX crm_tasks_delete_batch_idx     ON public.crm_tasks (delete_batch) WHERE delete_batch IS NOT NULL;
CREATE INDEX crm_tasks_trash_idx            ON public.crm_tasks (org_id, deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE public.crm_tasks IS
  'CRM tasks (call/email/todo) per org, optionally linked to a deal, company and/or contact. due_date is a plain '
  'date (no timezone). completed_at/by are maintained by crm_tasks_completion. Soft delete like the other CRM tables.';
COMMENT ON COLUMN public.crm_tasks.deleted_at IS
  'Trash: set by crm_soft_delete() on DELETE; NULL = live. Rows with a value are hidden by RLS. Restore with crm_restore(delete_batch).';
COMMENT ON COLUMN public.crm_tasks.delete_batch IS
  'Trash: rows deleted together (e.g. a deal with its tasks) share one batch; crm_restore / crm_purge act per batch.';

CREATE TRIGGER update_crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Completion -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_tasks_completion() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'done' THEN
    NEW.completed_at := coalesce(NEW.completed_at, now());
    NEW.completed_by := coalesce(NEW.completed_by, auth.uid());
  ELSE
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.crm_tasks_completion() FROM PUBLIC, anon, authenticated;
-- completed_* in the column list too: a hand-set completion on a task that is not done is cleared.
CREATE TRIGGER crm_tasks_completion BEFORE INSERT OR UPDATE OF status, completed_at, completed_by ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_tasks_completion();

-- 3. Links guard ------------------------------------------------------------------------------------
-- SECURITY DEFINER: the linked row's org and trash state must be read regardless of the caller's RLS (which hides
-- trashed rows and other orgs). A link that does not exist gets the same message as one of another org.
CREATE OR REPLACE FUNCTION public.crm_tasks_links_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org     uuid;
  v_deleted timestamptz;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;                                   -- the task itself goes to (or stays in) the trash
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL
     AND NEW.org_id IS NOT DISTINCT FROM OLD.org_id
     AND NEW.deal_id IS NOT DISTINCT FROM OLD.deal_id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.contact_id IS NOT DISTINCT FROM OLD.contact_id THEN
    RETURN NEW;                                   -- ordinary edit, links unchanged
  END IF;

  IF NEW.deal_id IS NOT NULL THEN
    SELECT org_id, deleted_at INTO v_org, v_deleted FROM public.deals WHERE id = NEW.deal_id;
    IF NOT FOUND OR v_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Gekoppeld item hoort niet bij deze organisatie'; END IF;
    IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'Dit item staat in de prullenbak'; END IF;
  END IF;
  IF NEW.company_id IS NOT NULL THEN
    SELECT org_id, deleted_at INTO v_org, v_deleted FROM public.companies WHERE id = NEW.company_id;
    IF NOT FOUND OR v_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Gekoppeld item hoort niet bij deze organisatie'; END IF;
    IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'Dit item staat in de prullenbak'; END IF;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT org_id, deleted_at INTO v_org, v_deleted FROM public.contacts WHERE id = NEW.contact_id;
    IF NOT FOUND OR v_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Gekoppeld item hoort niet bij deze organisatie'; END IF;
    IF v_deleted IS NOT NULL THEN RAISE EXCEPTION 'Dit item staat in de prullenbak'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.crm_tasks_links_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER crm_tasks_links_guard BEFORE INSERT OR UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_tasks_links_guard();

-- 4. History + trash triggers (shared functions) -----------------------------------------------------
CREATE TRIGGER crm_history AFTER INSERT OR UPDATE OR DELETE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_history_capture();
CREATE TRIGGER crm_soft_delete BEFORE DELETE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_soft_delete();

-- 5. RLS + grants (same 4 policies as the other trash tables) -----------------------------------------
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view crm_tasks" ON public.crm_tasks FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL);
CREATE POLICY "Members create crm_tasks" ON public.crm_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL);
CREATE POLICY "Members update crm_tasks" ON public.crm_tasks FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL)
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND deleted_at IS NULL);
CREATE POLICY "Members delete crm_tasks" ON public.crm_tasks FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
REVOKE ALL ON public.crm_tasks FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;

-- 6. Integrity counts: + crm_tasks (every row, trashed or not) -----------------------------------------
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
    'stages',           (SELECT count(*) FROM public.pipeline_stages WHERE org_id = p_org),
    'crm_tasks',        (SELECT count(*) FROM public.crm_tasks WHERE org_id = p_org)
  )
$$;
COMMENT ON FUNCTION public.crm_integrity_counts(uuid) IS
  'Ops/migration integrity counts per org. Counts every row including trashed ones (deleted_at set): a soft delete never changes these numbers, only crm_purge does.';
REVOKE ALL ON FUNCTION public.crm_integrity_counts(uuid) FROM PUBLIC, anon, authenticated;

-- 7. Soft delete: deal -> its tasks; company -> tasks of the company, its deals and its contacts ----------
-- Otherwise identical to 20261104000005 (incl. comment and grants).
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
    UPDATE public.crm_tasks SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE (company_id = OLD.id
             OR deal_id IN (SELECT id FROM public.deals WHERE delete_batch = v_batch)
             OR contact_id IN (SELECT id FROM public.contacts WHERE delete_batch = v_batch))
        AND org_id = OLD.org_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'deals' THEN
    UPDATE public.deal_activities SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE deal_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.crm_appointments SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE deal_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
    UPDATE public.crm_tasks SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE deal_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
  END IF;
  RETURN NULL;                                    -- the row stays; FK cascades never fire
END $$;
REVOKE ALL ON FUNCTION public.crm_soft_delete() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.crm_soft_delete() IS
  'BEFORE DELETE on the CRM record tables (deals, companies, contacts, deal_activities, crm_appointments, company_items, '
  'crm_tasks): turns a delete into a soft delete (deleted_at/by/batch) and trashes '
  'the children in the same batch; only crm_purge (crm.purge = on) really deletes. Consequence, intended (fail-safe): '
  'deleting an organization fails, because its ON DELETE CASCADE to these tables is suppressed and Postgres aborts '
  'the cascade. Organizations are never deleted by the app; CRM data must not vanish with them. '
  'SECURITY: the GUC crm.purge = on turns every delete into a real, unrecoverable delete. It is set only by '
  'crm_purge''s transaction-local set_config. Never expose set_config(''crm.purge'', ...) to clients through an RPC, a view or '
  'any SECURITY DEFINER function: that would bypass the trash, the org-admin check and the history scrub.';

-- 8. Trash list: tasks as entity 'crm_tasks' (label = title); batch_counts includes them -----------------
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
    UNION ALL
    SELECT 'crm_tasks', 3, x.id, x.title, x.deleted_at, x.deleted_by, x.delete_batch
      FROM public.crm_tasks x WHERE x.org_id = p_org AND x.deleted_at IS NOT NULL
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
         -- what the batch holds besides its head, e.g. {"deals": 3, "contacts": 2, "crm_tasks": 1}
         coalesce((SELECT jsonb_object_agg(p.ent, p.c - (p.ent = r.ent)::int) FROM per p
                   WHERE p.k = coalesce(r.bat, r.id) AND p.c - (p.ent = r.ent)::int > 0), '{}'::jsonb)
         || coalesce((SELECT jsonb_build_object('deal_fees', f.c) FROM fees f WHERE f.k = coalesce(r.bat, r.id)), '{}'::jsonb)
  FROM ranked r WHERE r.rn = 1
  ORDER BY r.dat DESC, r.id;
END $$;
REVOKE ALL ON FUNCTION public.crm_trash_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_trash_list(uuid) TO authenticated, service_role;

-- 9. Restore: tasks last (after their deal / company / contact) ------------------------------------------
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
    UNION ALL SELECT org_id FROM public.crm_tasks WHERE delete_batch = p_batch
  ) s LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Geen toegang';
  END IF;
  FOREACH t IN ARRAY ARRAY['companies','deals','contacts','deal_activities','crm_appointments','company_items','crm_tasks'] LOOP
    EXECUTE format('UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL, delete_batch = NULL
                    WHERE delete_batch = $1 AND org_id = $2', t) USING p_batch, v_org;
    GET DIAGNOSTICS v_c = ROW_COUNT;
    v_n := v_n + v_c;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.crm_restore(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_restore(uuid) TO authenticated, service_role;

-- 10. Purge: + crm_tasks (entity, guard, delete, history scrub) -----------------------------------------
-- Otherwise identical to 20261104000005. Tasks link by ON DELETE SET NULL, so a purge would not delete a live task
-- but silently unlink it; the guard refuses that too, so the user decides about the task first.
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
  v_tasks     uuid[];
  v_files     text[];
  v_n         int := 0;
  v_c         int;
BEGIN
  IF p_entity IS NULL OR p_entity NOT IN ('deals','companies','contacts','deal_activities','crm_appointments','company_items','crm_tasks') THEN
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
  v_tasks     := ARRAY(SELECT id FROM public.crm_tasks WHERE delete_batch = v_batch);

  -- Never take live data along: every ON DELETE CASCADE child with a trash state (deal_activities and
  -- crm_appointments via deal_id, company_items via company_id) must itself be in the trash. deal_fees and
  -- deal_contacts have no trash state; they belong to the deal / the contact link and go with it.
  -- Live tasks (ON DELETE SET NULL) linked to the batch would lose their link: refused as well.
  IF EXISTS (SELECT 1 FROM public.deal_activities  WHERE deal_id = ANY (v_deals) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.crm_appointments WHERE deal_id = ANY (v_deals) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.company_items    WHERE company_id = ANY (v_companies) AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.crm_tasks        WHERE deleted_at IS NULL
                  AND (deal_id = ANY (v_deals) OR company_id = ANY (v_companies) OR contact_id = ANY (v_contacts))) THEN
    RAISE EXCEPTION 'Er hangen nog actieve gegevens aan dit item; zet die eerst in de prullenbak';
  END IF;

  -- Files of every company_item that disappears (its own batch or taken along by the company FK cascade).
  v_files := ARRAY(SELECT storage_path FROM public.company_items
                   WHERE id = ANY (v_items) AND storage_path IS NOT NULL ORDER BY storage_path);

  DELETE FROM public.crm_tasks        WHERE delete_batch = v_batch; GET DIAGNOSTICS v_c = ROW_COUNT; v_n := v_n + v_c;
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
     OR (entity = 'crm_tasks'        AND record_id = ANY (v_tasks))
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
  '(transaction-local set_config), which makes crm_soft_delete let deletes through. SECURITY: never expose '
  'set_config(''crm.purge'', ...) to clients through an RPC, a view or any SECURITY DEFINER function.';

-- 11. Verify -----------------------------------------------------------------------------------------
DO $$ DECLARE r record; v_after jsonb; BEGIN
  FOR r IN SELECT * FROM _crm_counts_before_tasks LOOP
    v_after := public.crm_integrity_counts(r.org_id);
    -- keys new in this migration are ignored in the comparison (crm_tasks must be 0: the table is new)
    IF r.counts IS DISTINCT FROM (v_after - 'crm_tasks') OR (v_after ->> 'crm_tasks')::int IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'Integriteitscontrole mislukt voor org %: voor=% na=%', r.org_id, r.counts, v_after;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.organizations) <> (SELECT count(*) FROM _crm_counts_before_tasks) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: aantal organisaties veranderd';
  END IF;
  IF (SELECT count(*) FROM public.crm_history) <> (SELECT n FROM _crm_history_before_tasks) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: migratie schreef historie (geen datawijziging verwacht)';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'crm_soft_delete' AND tgfoid = 'public.crm_soft_delete()'::regprocedure) <> 7
     OR (SELECT count(*) FROM pg_trigger WHERE tgname = 'crm_history' AND tgfoid = 'public.crm_history_capture()'::regprocedure) <> 12 THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: prullenbak- of historie-trigger ontbreekt op crm_tasks';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.crm_tasks'::regclass AND NOT tgisinternal
        AND tgname IN ('update_crm_tasks_updated_at','crm_tasks_completion','crm_tasks_links_guard','crm_history','crm_soft_delete')) <> 5 THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: triggers op crm_tasks onvolledig';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_tasks') <> 4
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'crm_tasks' AND cmd = 'ALL')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_tasks'::regclass) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: onverwachte RLS-policies op crm_tasks';
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '=== CRM taken migratie-rapport ===';
  RAISE NOTICE 'tabel crm_tasks aangemaakt met historie, prullenbak, koppelings- en afrondtrigger, 4 RLS-policies';
  RAISE NOTICE 'geen bestaande data gewijzigd; integriteitstellingen per org gelijk (nieuwe sleutel crm_tasks = 0)';
END $$;

COMMIT;
