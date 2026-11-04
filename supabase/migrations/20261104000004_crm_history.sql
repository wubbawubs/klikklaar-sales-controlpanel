-- CRM foundation 4/n: change history for every CRM record (who, what, when).
--  * crm_history: one row per insert/update/delete. Insert and delete keep the full row; an update keeps only
--    the changed columns as {column: {"from": x, "to": y}}. updated_at and stage_updated_at are ignored, and an
--    update that changes nothing else writes no row.
--  * Soft delete / restore (deleted_at arrives in the trash migration) is detected generically: deleted_at
--    null -> set is logged as 'delete', set -> null as 'restore'.
--  * Only the SECURITY DEFINER trigger writes. Members can read their org's history; nobody can write, change,
--    delete or truncate it through the API.
--  * entity = table name; record_id = the row's id, except deal_contacts (no id column): record_id = deal_id and
--    contact_id is always included in its update diffs, so the link stays identifiable.
-- Data changes: none (DDL only). Self-verifying: crm_integrity_counts per org identical before and after.
-- No BEGIN/COMMIT here: `supabase db push` wraps this file in one transaction (harness: psql -1).

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.deals, public.companies, public.contacts, public.deal_activities, public.crm_appointments,
           public.deal_fees, public.deal_contacts, public.pipeline_stages, public.funnels, public.crm_fields,
           public.company_items IN SHARE ROW EXCLUSIVE MODE;                                  -- CREATE TRIGGER below

CREATE TEMP TABLE _crm_counts_before_history ON COMMIT DROP AS
  SELECT o.id AS org_id, public.crm_integrity_counts(o.id) AS counts FROM public.organizations o;

-- 1. Table -----------------------------------------------------------------------------------------
-- org_id has no FK on purpose: history must survive anything, and is never cascaded away.
CREATE TABLE public.crm_history (
  id        bigserial PRIMARY KEY,
  org_id    uuid NOT NULL,
  entity    text NOT NULL,
  record_id uuid NOT NULL,
  action    text NOT NULL CHECK (action IN ('insert','update','delete','restore','purge')),
  changes   jsonb NOT NULL,
  actor     uuid,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_history_record_idx ON public.crm_history (entity, record_id, at DESC);
CREATE INDEX crm_history_org_idx ON public.crm_history (org_id, at DESC);

COMMENT ON TABLE public.crm_history IS
  'Change log written only by crm_history_capture(). entity = table name; record_id = row id (deal_contacts: deal_id). '
  'changes: full row for insert/delete, {column: {from, to}} for update/restore/soft delete. actor = auth.uid(), null for service role.';

ALTER TABLE public.crm_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view crm history" ON public.crm_history FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
-- No insert/update/delete policy for any role. Grants are also read-only: RLS does not cover TRUNCATE.
REVOKE ALL ON public.crm_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.crm_history TO authenticated, service_role;
REVOKE ALL ON SEQUENCE public.crm_history_id_seq FROM PUBLIC, anon, authenticated, service_role;

-- 2. Capture trigger -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_history_capture() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_action  text;
  v_changes jsonb;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_old := to_jsonb(OLD) - 'updated_at' - 'stage_updated_at'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_new := to_jsonb(NEW) - 'updated_at' - 'stage_updated_at'; END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert'; v_changes := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete'; v_changes := to_jsonb(OLD);
  ELSE
    SELECT coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value)), '{}'::jsonb)
      INTO v_changes
    FROM jsonb_each(v_new) n
    WHERE n.value IS DISTINCT FROM v_old -> n.key;
    IF v_changes = '{}'::jsonb THEN RETURN NULL; END IF;   -- only ignored columns changed

    v_action := 'update';
    IF v_old ? 'deleted_at' THEN
      IF jsonb_typeof(v_old -> 'deleted_at') = 'null' AND jsonb_typeof(v_new -> 'deleted_at') <> 'null' THEN
        v_action := 'delete';
      ELSIF jsonb_typeof(v_old -> 'deleted_at') <> 'null' AND jsonb_typeof(v_new -> 'deleted_at') = 'null' THEN
        v_action := 'restore';
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'deal_contacts' AND NOT v_changes ? 'contact_id' THEN
      v_changes := v_changes || jsonb_build_object('contact_id',
                     jsonb_build_object('from', v_old -> 'contact_id', 'to', v_new -> 'contact_id'));
    END IF;
  END IF;

  v_row := coalesce(v_new, v_old);
  INSERT INTO public.crm_history (org_id, entity, record_id, action, changes, actor)
  VALUES ((v_row ->> 'org_id')::uuid,
          TG_TABLE_NAME,
          (CASE WHEN TG_TABLE_NAME = 'deal_contacts' THEN v_row ->> 'deal_id' ELSE v_row ->> 'id' END)::uuid,
          v_action, v_changes, auth.uid());
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.crm_history_capture() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['deals','companies','contacts','deal_activities','crm_appointments','deal_fees',
                           'deal_contacts','pipeline_stages','funnels','crm_fields','company_items'] LOOP
    EXECUTE format('CREATE TRIGGER crm_history AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.crm_history_capture()', t);
  END LOOP;
END $$;

-- 3. Verify ----------------------------------------------------------------------------------------
DO $$ DECLARE r record; v_after jsonb; BEGIN
  FOR r IN SELECT * FROM _crm_counts_before_history LOOP
    v_after := public.crm_integrity_counts(r.org_id);
    IF r.counts <> v_after THEN
      RAISE EXCEPTION 'Integriteitscontrole mislukt voor org %: voor=% na=%', r.org_id, r.counts, v_after;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.organizations) <> (SELECT count(*) FROM _crm_counts_before_history) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: aantal organisaties veranderd';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crm_history) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: migratie schreef historie (geen datawijziging verwacht)';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'crm_history' AND tgfoid = 'public.crm_history_capture()'::regprocedure) <> 11 THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: historie-trigger niet op alle 11 tabellen';
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '=== CRM historie migratie-rapport ===';
  RAISE NOTICE 'historie-trigger actief op 11 tabellen; geen bestaande data gewijzigd';
END $$;
