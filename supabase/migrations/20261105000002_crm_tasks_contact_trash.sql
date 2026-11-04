-- CRM plan 3, 2/n: trashing a contact takes its live tasks along (symmetric with deals).
--  * crm_soft_delete: a contact delete now also trashes the contact's live tasks in the same batch. Before, such a
--    task stayed live while linked to a trashed contact; if its deal was trashed later, the task landed in the deal
--    batch and restoring the deal failed ('Dit item staat in de prullenbak' from crm_tasks_links_guard).
--  * crm_restore needs no change: it already restores contacts before crm_tasks within a batch.
-- Otherwise crm_soft_delete is identical to 20261105000001 (signature, SECURITY DEFINER, search_path, grants,
-- comment). 20261105000001 itself is not modified.
-- Data changes: none. Self-verifying: crm_integrity_counts per org identical before/after, no history written.
-- Runs in its own explicit transaction (BEGIN/COMMIT below; the Supabase CLI does not wrap files itself).

BEGIN;
SET LOCAL lock_timeout = '5s';
-- The replaced trigger function fires on deletes of these tables: no concurrent deletes meanwhile.
LOCK TABLE public.companies, public.deals, public.contacts, public.crm_tasks IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _crm_counts_before_ctrash ON COMMIT DROP AS
  SELECT o.id AS org_id, public.crm_integrity_counts(o.id) AS counts FROM public.organizations o;
CREATE TEMP TABLE _crm_history_before_ctrash ON COMMIT DROP AS
  SELECT count(*) AS n FROM public.crm_history;

-- 1. Soft delete: + contact -> its tasks -------------------------------------------------------------
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
  ELSIF TG_TABLE_NAME = 'contacts' THEN
    UPDATE public.crm_tasks SET deleted_at = v_now, deleted_by = v_uid, delete_batch = v_batch
      WHERE contact_id = OLD.id AND org_id = OLD.org_id AND deleted_at IS NULL;
  END IF;
  RETURN NULL;                                    -- the row stays; FK cascades never fire
END $$;
REVOKE ALL ON FUNCTION public.crm_soft_delete() FROM PUBLIC, anon, authenticated;

-- 2. Verify -----------------------------------------------------------------------------------------
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM _crm_counts_before_ctrash LOOP
    IF r.counts IS DISTINCT FROM public.crm_integrity_counts(r.org_id) THEN
      RAISE EXCEPTION 'Integriteitscontrole mislukt voor org %: voor=% na=%', r.org_id, r.counts, public.crm_integrity_counts(r.org_id);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.organizations) <> (SELECT count(*) FROM _crm_counts_before_ctrash) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: aantal organisaties veranderd';
  END IF;
  IF (SELECT count(*) FROM public.crm_history) <> (SELECT n FROM _crm_history_before_ctrash) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: migratie schreef historie (geen datawijziging verwacht)';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'crm_soft_delete' AND tgfoid = 'public.crm_soft_delete()'::regprocedure) <> 7 THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: prullenbak-trigger ontbreekt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.crm_soft_delete()'::regprocedure AND prosecdef
                   AND proconfig @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: crm_soft_delete niet SECURITY DEFINER met search_path';
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '=== CRM taken contact-prullenbak migratie-rapport ===';
  RAISE NOTICE 'crm_soft_delete: contact naar prullenbak neemt zijn open taken mee in dezelfde batch';
  RAISE NOTICE 'geen bestaande data gewijzigd; integriteitstellingen per org gelijk';
END $$;

COMMIT;
