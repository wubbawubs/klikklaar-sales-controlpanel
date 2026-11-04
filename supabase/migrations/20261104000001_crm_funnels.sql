-- CRM foundation 1/n: funnels (several pipelines per organisation) + stage types.
-- Self-verifying: snapshots the CRM tables into crm_backup_20261104, records integrity counts per org,
-- backfills, recomputes and RAISEs (rolling back everything) if any count differs.
-- Data changes are limited to: new rows in funnels, the missing Gewonnen/Verloren stages per funnel,
-- and backfilling the NEW columns funnel_id / stage_type. Nothing is dropped; won_at is never backfilled.
-- No BEGIN/COMMIT here: `supabase db push` runs this file plus its schema_migrations insert as one
-- transaction (the test harness mirrors that with psql -1). The ON COMMIT DROP temp tables rely on it.

-- 0. Locks: snapshot + counts must be consistent; concurrent app writes wait (or abort cleanly).
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.deals, public.pipeline_stages, public.organizations IN ACCESS EXCLUSIVE MODE;  -- altered below
LOCK TABLE public.companies, public.contacts, public.deal_activities, public.crm_appointments,
           public.deal_fees, public.company_items IN SHARE MODE;

-- 1. Backup snapshot ---------------------------------------------------------------------------
CREATE SCHEMA crm_backup_20261104;
REVOKE ALL ON SCHEMA crm_backup_20261104 FROM PUBLIC;
CREATE TABLE crm_backup_20261104.deals            AS SELECT * FROM public.deals;
CREATE TABLE crm_backup_20261104.pipeline_stages  AS SELECT * FROM public.pipeline_stages;
CREATE TABLE crm_backup_20261104.companies        AS SELECT * FROM public.companies;
CREATE TABLE crm_backup_20261104.contacts         AS SELECT * FROM public.contacts;
CREATE TABLE crm_backup_20261104.deal_activities  AS SELECT * FROM public.deal_activities;
CREATE TABLE crm_backup_20261104.crm_appointments AS SELECT * FROM public.crm_appointments;
CREATE TABLE crm_backup_20261104.deal_fees        AS SELECT * FROM public.deal_fees;
CREATE TABLE crm_backup_20261104.company_items    AS SELECT * FROM public.company_items;
DO $$ DECLARE t text; n_src bigint; n_bak bigint; BEGIN
  FOREACH t IN ARRAY ARRAY['deals','pipeline_stages','companies','contacts','deal_activities','crm_appointments','deal_fees','company_items'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n_src;
    EXECUTE format('SELECT count(*) FROM crm_backup_20261104.%I', t) INTO n_bak;
    IF n_src <> n_bak THEN RAISE EXCEPTION 'Backup % incompleet: % vs %', t, n_bak, n_src; END IF;
    EXECUTE format('REVOKE ALL ON crm_backup_20261104.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- 2. Integrity counts (ops tool; SECURITY DEFINER so RLS cannot skew the numbers) ---------------
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
REVOKE ALL ON FUNCTION public.crm_integrity_counts(uuid) FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _crm_counts_before ON COMMIT DROP AS
  SELECT o.id AS org_id, public.crm_integrity_counts(o.id) AS counts FROM public.organizations o;

-- 3. DDL --------------------------------------------------------------------------------------
CREATE TABLE public.funnels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  amount_mode text NOT NULL DEFAULT 'fixed' CHECK (amount_mode IN ('fixed','range','none')),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX funnels_org_id_idx ON public.funnels (org_id, position);
CREATE TRIGGER trg_funnels_updated_at BEFORE UPDATE ON public.funnels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view funnels" ON public.funnels FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
-- Task 3 replaces the admin rule below with the org-admin (client-admin) rule.
CREATE POLICY "Admins create funnels" ON public.funnels FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND public.is_admin(auth.uid()));
CREATE POLICY "Admins update funnels" ON public.funnels FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) AND public.is_admin(auth.uid()))
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND public.is_admin(auth.uid()));
REVOKE ALL ON public.funnels FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.funnels TO authenticated;
GRANT ALL ON public.funnels TO service_role;

ALTER TABLE public.pipeline_stages
  ADD COLUMN funnel_id uuid REFERENCES public.funnels(id),
  ADD COLUMN stage_type text NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost'));
ALTER TABLE public.deals ADD COLUMN funnel_id uuid REFERENCES public.funnels(id);
ALTER TABLE public.organizations
  ADD COLUMN kind text NOT NULL DEFAULT 'label' CHECK (kind IN ('label','client'));
CREATE INDEX pipeline_stages_funnel_id_idx ON public.pipeline_stages (funnel_id, position);
CREATE INDEX deals_funnel_id_idx ON public.deals (funnel_id);

-- 4. Backfill ---------------------------------------------------------------------------------
INSERT INTO public.funnels (org_id, name, position)
SELECT o.id, 'Sales pipeline', 0 FROM public.organizations o
WHERE EXISTS (SELECT 1 FROM public.pipeline_stages s WHERE s.org_id = o.id)
   OR EXISTS (SELECT 1 FROM public.deals d WHERE d.org_id = o.id);

UPDATE public.pipeline_stages s SET funnel_id = f.id FROM public.funnels f WHERE f.org_id = s.org_id;

UPDATE public.pipeline_stages SET stage_type = CASE
    WHEN lower(trim(name)) IN ('won','gewonnen') THEN 'won'
    WHEN lower(trim(name)) IN ('lost','verloren') THEN 'lost'
  END
WHERE lower(trim(name)) IN ('won','gewonnen','lost','verloren');

CREATE TEMP TABLE _crm_added_stages (stage_id uuid, org_id uuid, name text, stage_type text) ON COMMIT DROP;
WITH ins AS (
  INSERT INTO public.pipeline_stages (org_id, funnel_id, name, position, color, stage_type)
  SELECT f.org_id, f.id, 'Gewonnen',
         coalesce((SELECT max(position) FROM public.pipeline_stages s WHERE s.funnel_id = f.id), 0) + 1, '#10B981', 'won'
  FROM public.funnels f
  WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages s WHERE s.funnel_id = f.id AND s.stage_type = 'won')
  RETURNING id, org_id, name, stage_type)
INSERT INTO _crm_added_stages SELECT * FROM ins;
WITH ins AS (
  INSERT INTO public.pipeline_stages (org_id, funnel_id, name, position, color, stage_type)
  SELECT f.org_id, f.id, 'Verloren',
         coalesce((SELECT max(position) FROM public.pipeline_stages s WHERE s.funnel_id = f.id), 0) + 1, '#EF4444', 'lost'
  FROM public.funnels f
  WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages s WHERE s.funnel_id = f.id AND s.stage_type = 'lost')
  RETURNING id, org_id, name, stage_type)
INSERT INTO _crm_added_stages SELECT * FROM ins;

-- deals.funnel_id: the backfill must not bump updated_at, so the updated_at trigger is paused here only.
ALTER TABLE public.deals DISABLE TRIGGER update_deals_updated_at;
UPDATE public.deals d SET funnel_id = s.funnel_id
FROM public.pipeline_stages s WHERE s.id = d.stage_id AND d.funnel_id IS NULL;
UPDATE public.deals d SET funnel_id = f.id
FROM public.funnels f WHERE f.org_id = d.org_id AND d.funnel_id IS NULL;
ALTER TABLE public.deals ENABLE TRIGGER update_deals_updated_at;

-- 5. NOT NULL ---------------------------------------------------------------------------------
ALTER TABLE public.pipeline_stages ALTER COLUMN funnel_id SET NOT NULL;
ALTER TABLE public.deals ALTER COLUMN funnel_id SET NOT NULL;

-- 6. A deal's stage must belong to the deal's funnel ------------------------------------------
-- (A plain BEFORE trigger: Postgres constraint triggers can only be AFTER triggers.)
CREATE OR REPLACE FUNCTION public.deals_stage_in_funnel() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL
     AND (SELECT funnel_id FROM public.pipeline_stages WHERE id = NEW.stage_id) IS DISTINCT FROM NEW.funnel_id THEN
    RAISE EXCEPTION 'Fase hoort niet bij deze funnel';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.deals_stage_in_funnel() FROM PUBLIC, anon, authenticated;
-- Trigger names fire alphabetically: deals_funnel_default (7) runs before deals_stage_in_funnel.
CREATE TRIGGER deals_stage_in_funnel BEFORE INSERT OR UPDATE OF stage_id, funnel_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_stage_in_funnel();

-- 7. funnel_id defaults on insert ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deals_funnel_default() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.funnel_id IS NULL AND NEW.stage_id IS NOT NULL THEN
    SELECT funnel_id INTO NEW.funnel_id FROM public.pipeline_stages WHERE id = NEW.stage_id;
  END IF;
  IF NEW.funnel_id IS NULL THEN
    SELECT id INTO NEW.funnel_id FROM public.funnels
    WHERE org_id = NEW.org_id ORDER BY (archived_at IS NOT NULL), position, created_at, id LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.deals_funnel_default() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deals_funnel_default BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_funnel_default();

-- Same fallback for stages, so existing app code that inserts stages without funnel_id keeps working
-- until the frontend passes funnel_id itself (creates the org's first funnel when it has none).
-- Also types stages the app seeds by name only (Won/Verloren) — INSERT only, exact won/lost names.
CREATE OR REPLACE FUNCTION public.pipeline_stages_funnel_default() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.stage_type = 'open' THEN
    IF lower(trim(NEW.name)) IN ('won','gewonnen') THEN NEW.stage_type := 'won';
    ELSIF lower(trim(NEW.name)) IN ('lost','verloren') THEN NEW.stage_type := 'lost';
    END IF;
  END IF;
  IF NEW.funnel_id IS NULL THEN
    SELECT id INTO NEW.funnel_id FROM public.funnels
    WHERE org_id = NEW.org_id ORDER BY (archived_at IS NOT NULL), position, created_at, id LIMIT 1;
    IF NEW.funnel_id IS NULL THEN
      INSERT INTO public.funnels (org_id, name, position) VALUES (NEW.org_id, 'Sales pipeline', 0)
      RETURNING id INTO NEW.funnel_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pipeline_stages_funnel_default() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pipeline_stages_funnel_default BEFORE INSERT ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_stages_funnel_default();

-- seed_default_stages: same stages as before, typed. SECURITY INVOKER, so it does not insert into
-- funnels itself (RLS denies non-admins); pipeline_stages_funnel_default picks/creates the funnel.
CREATE OR REPLACE FUNCTION public.seed_default_stages(_org_id uuid) RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.pipeline_stages (org_id, name, position, color, stage_type) VALUES
    (_org_id, 'Prospect',        1, '#6B7280', 'open'),
    (_org_id, 'Gecontacteerd',   2, '#3B82F6', 'open'),
    (_org_id, 'Audit Verstuurd', 3, '#8B5CF6', 'open'),
    (_org_id, 'Voorstel',        4, '#F59E0B', 'open'),
    (_org_id, 'Onderhandeling',  5, '#EC4899', 'open'),
    (_org_id, 'Won',             6, '#10B981', 'won'),
    (_org_id, 'Verloren',        7, '#EF4444', 'lost');
END;
$$;

-- 8. Verify: every count equal per org, except stages which grow by exactly the added rows ------
DO $$ DECLARE r record; v_after jsonb; v_added int; BEGIN
  FOR r IN SELECT * FROM _crm_counts_before LOOP
    v_after := public.crm_integrity_counts(r.org_id);
    SELECT count(*) INTO v_added FROM _crm_added_stages WHERE org_id = r.org_id;
    IF (r.counts - 'stages') <> (v_after - 'stages')
       OR (v_after->>'stages')::bigint <> (r.counts->>'stages')::bigint + v_added THEN
      RAISE EXCEPTION 'Integriteitscontrole mislukt voor org %: voor=% na=% (toegevoegde fases: %)', r.org_id, r.counts, v_after, v_added;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.organizations) <> (SELECT count(*) FROM _crm_counts_before) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: aantal organisaties veranderd';
  END IF;
  IF (SELECT count(*) FROM public.deals) <> (SELECT count(*) FROM crm_backup_20261104.deals)
     OR (SELECT count(*) FROM public.pipeline_stages) <> (SELECT count(*) FROM crm_backup_20261104.pipeline_stages) + (SELECT count(*) FROM _crm_added_stages) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: totalen wijken af van backup';
  END IF;
END $$;

-- 9. Report -------------------------------------------------------------------------------------
DO $$ DECLARE r record; v text; BEGIN
  RAISE NOTICE '=== CRM funnels migratie-rapport ===';
  FOR r IN SELECT o.id, o.name FROM public.organizations o
           WHERE EXISTS (SELECT 1 FROM public.funnels f WHERE f.org_id = o.id) ORDER BY o.name LOOP
    SELECT string_agg(format('%s → %s', s.name, s.stage_type), ', ' ORDER BY s.position) INTO v
      FROM public.pipeline_stages s
      WHERE s.org_id = r.id AND s.stage_type <> 'open' AND s.id NOT IN (SELECT stage_id FROM _crm_added_stages);
    RAISE NOTICE 'org % (%): herkend als won/lost: %', r.name, r.id, coalesce(v, '(geen)');
    SELECT string_agg(format('%s (%s)', a.name, a.stage_type), ', ') INTO v FROM _crm_added_stages a WHERE a.org_id = r.id;
    RAISE NOTICE 'org % (%): toegevoegde fases: %', r.name, r.id, coalesce(v, '(geen)');
    SELECT string_agg(format('%s "%s" in fase "%s"', d.id, d.title, s.name), '; ' ORDER BY d.created_at) INTO v
      FROM public.deals d JOIN public.pipeline_stages s ON s.id = d.stage_id
      WHERE d.org_id = r.id AND s.stage_type = 'won' AND d.won_at IS NULL;
    RAISE NOTICE 'org % (%): deals in won-fase zonder won_at (niet aangepast): %', r.name, r.id, coalesce(v, '(geen)');
  END LOOP;
END $$;
