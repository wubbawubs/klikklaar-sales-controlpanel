-- CRM foundation 3/n: configurable field storage + contacts on several deals.
--  * crm_fields: per-org field definitions (deal fields per funnel; company/contact fields per org).
--    9 built-in deal fields per funnel map to real deals columns; custom values live in <table>.custom,
--    keyed by crm_fields.id (renames never break them; choice values store the option id).
--  * new nullable deal columns + custom jsonb on deals/companies/contacts; contacts.relation_type/owner_id
--  * deal_contacts: a contact can sit on several deals; is_primary stays in sync with deals.contact_id
--    in both directions, so old screens that only write deals.contact_id keep working.
-- Data changes: only rows in the new tables (deal_contacts backfill, built-in crm_fields per funnel).
-- Self-verifying: crm_integrity_counts per org must be identical before and after.
-- No BEGIN/COMMIT here: `supabase db push` wraps this file in one transaction (harness: psql -1).

SET LOCAL lock_timeout = '5s';
LOCK TABLE public.deals, public.contacts, public.companies IN ACCESS EXCLUSIVE MODE;   -- altered below
LOCK TABLE public.funnels, public.organizations IN SHARE ROW EXCLUSIVE MODE;          -- trigger / FK targets
LOCK TABLE public.pipeline_stages, public.deal_activities, public.crm_appointments,
           public.deal_fees, public.company_items IN SHARE MODE;                       -- stable integrity counts

CREATE TEMP TABLE _crm_counts_before_fields ON COMMIT DROP AS
  SELECT o.id AS org_id, public.crm_integrity_counts(o.id) AS counts FROM public.organizations o;

-- 1. New columns (all nullable or with a constant default: no existing value changes) ------------
ALTER TABLE public.deals
  ADD COLUMN value_min_eur numeric(12,2),
  ADD COLUMN value_max_eur numeric(12,2),
  ADD COLUMN win_chance    smallint CHECK (win_chance BETWEEN 0 AND 100),
  ADD COLUMN priority      text,
  ADD COLUMN country       text,
  ADD COLUMN planned_start date,
  ADD COLUMN lead_source   text,
  ADD COLUMN category      text,
  ADD COLUMN description   text,
  ADD COLUMN custom        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom) = 'object'),
  ADD CONSTRAINT deals_value_range_check
    CHECK (value_min_eur IS NULL OR value_max_eur IS NULL OR value_min_eur <= value_max_eur);
ALTER TABLE public.companies
  ADD COLUMN custom jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom) = 'object');
ALTER TABLE public.contacts
  ADD COLUMN custom        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom) = 'object'),
  ADD COLUMN relation_type text,
  ADD COLUMN owner_id      uuid;

-- 2. crm_fields ------------------------------------------------------------------------------------
CREATE TABLE public.crm_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity      text NOT NULL CHECK (entity IN ('deal','company','contact')),
  funnel_id   uuid REFERENCES public.funnels(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  type        text NOT NULL CHECK (type IN ('text','long_text','number','money','date','choice','yes_no')),
  options     jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(options) = 'array'),  -- [{id, label, position, archived}]
  builtin     boolean NOT NULL DEFAULT false,
  enabled     boolean NOT NULL DEFAULT true,
  position    int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_fields_funnel_by_entity CHECK ((entity = 'deal') = (funnel_id IS NOT NULL))
);
CREATE UNIQUE INDEX crm_fields_key_uniq
  ON public.crm_fields (org_id, entity, coalesce(funnel_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
CREATE INDEX crm_fields_funnel_idx ON public.crm_fields (funnel_id, position);
CREATE TRIGGER trg_crm_fields_updated_at BEFORE UPDATE ON public.crm_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.crm_fields IS
  'Field definitions. Built-in deal keys map to deals columns: amount (value_eur, or value_min_eur/value_max_eur '
  'per funnels.amount_mode), billing_type (billing_type_id), win_chance, priority, country, planned_start, lead_source, '
  'category, description. Custom values live in deals/companies/contacts.custom keyed by crm_fields.id; choice values store the option id.';

-- Guard: a deal field's funnel belongs to the field's org; built-ins keep their identity; app users cannot mint built-ins.
CREATE OR REPLACE FUNCTION public.crm_fields_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.funnel_id IS NOT NULL
     AND (SELECT f.org_id FROM public.funnels f WHERE f.id = NEW.funnel_id) IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Funnel hoort niet bij deze organisatie';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.builtin AND current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Ingebouwd veld kan niet handmatig worden aangemaakt';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.builtin OR NEW.builtin)
     AND (NEW.builtin, NEW.key, NEW.type, NEW.entity, NEW.org_id, NEW.funnel_id)
         IS DISTINCT FROM (OLD.builtin, OLD.key, OLD.type, OLD.entity, OLD.org_id, OLD.funnel_id) THEN
    RAISE EXCEPTION 'Ingebouwd veld: sleutel, type en funnel liggen vast';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_fields_guard BEFORE INSERT OR UPDATE ON public.crm_fields
  FOR EACH ROW EXECUTE FUNCTION public.crm_fields_guard();

ALTER TABLE public.crm_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view crm fields" ON public.crm_fields FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Org admins create crm fields" ON public.crm_fields FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "Org admins update crm fields" ON public.crm_fields FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id))
  WITH CHECK (public.is_org_admin(auth.uid(), org_id));
REVOKE ALL ON public.crm_fields FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.crm_fields TO authenticated;   -- no DELETE: archive via archived_at
GRANT ALL ON public.crm_fields TO service_role;

-- Built-in deal fields for one funnel (idempotent). Used by the backfill and by new funnels.
CREATE OR REPLACE FUNCTION public.crm_seed_builtin_fields(p_funnel uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.crm_fields (org_id, entity, funnel_id, key, label, type, builtin, enabled, position)
  SELECT f.org_id, 'deal', f.id, b.key, b.label, b.type, true, b.enabled, b.position
  FROM public.funnels f
  CROSS JOIN (VALUES
    ('amount',        'Bedrag',        'money',     true,  0),
    ('billing_type',  'Facturatie',    'choice',    true,  1),
    ('win_chance',    'Winkans',       'number',    false, 2),
    ('priority',      'Prioriteit',    'choice',    false, 3),
    ('country',       'Land',          'text',      false, 4),
    ('planned_start', 'Beoogde start', 'date',      false, 5),
    ('lead_source',   'Leadbron',      'text',      false, 6),
    ('category',      'Categorie',     'choice',    false, 7),
    ('description',   'Omschrijving',  'long_text', false, 8)
  ) AS b(key, label, type, enabled, position)
  WHERE f.id = p_funnel
  ON CONFLICT DO NOTHING
$$;
REVOKE ALL ON FUNCTION public.crm_seed_builtin_fields(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.funnels_seed_builtin_fields() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.crm_seed_builtin_fields(NEW.id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.funnels_seed_builtin_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER funnels_seed_builtin_fields AFTER INSERT ON public.funnels
  FOR EACH ROW EXECUTE FUNCTION public.funnels_seed_builtin_fields();

-- 3. deal_contacts ---------------------------------------------------------------------------------
CREATE TABLE public.deal_contacts (
  deal_id    uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role       text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, contact_id)
);
CREATE UNIQUE INDEX deal_contacts_one_primary ON public.deal_contacts (deal_id) WHERE is_primary;
CREATE INDEX deal_contacts_contact_idx ON public.deal_contacts (contact_id);
CREATE INDEX deal_contacts_org_idx ON public.deal_contacts (org_id);

ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view deal contacts" ON public.deal_contacts FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members create deal contacts" ON public.deal_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members update deal contacts" ON public.deal_contacts FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id))
  WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members delete deal contacts" ON public.deal_contacts FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
REVOKE ALL ON public.deal_contacts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_contacts TO authenticated;
GRANT ALL ON public.deal_contacts TO service_role;

-- BEFORE: org_id follows the deal (filled when omitted), the contact must be in that org,
-- and a new primary demotes the previous one (one primary per deal).
-- SECURITY DEFINER: the org lookups must not depend on the caller's RLS view; RLS WITH CHECK
-- still runs on the resulting row, so a member cannot link into a foreign org's deal.
CREATE OR REPLACE FUNCTION public.deal_contacts_before() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.deals WHERE id = NEW.deal_id;
  IF NEW.org_id IS NULL THEN NEW.org_id := v_org; END IF;
  IF NEW.org_id IS DISTINCT FROM v_org
     OR (SELECT c.org_id FROM public.contacts c WHERE c.id = NEW.contact_id) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Contact hoort niet bij de organisatie van de deal';
  END IF;
  IF NEW.is_primary THEN
    UPDATE public.deal_contacts SET is_primary = false
    WHERE deal_id = NEW.deal_id AND is_primary AND contact_id <> NEW.contact_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.deal_contacts_before() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deal_contacts_before BEFORE INSERT OR UPDATE ON public.deal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.deal_contacts_before();

-- AFTER: mirror the primary row into deals.contact_id. Writes only when the value differs, so the
-- reverse trigger (deals_sync_primary_contact) sees no change and the recursion stops.
CREATE OR REPLACE FUNCTION public.deal_contacts_sync_deal() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.is_primary
     AND NOT (TG_OP = 'UPDATE' AND NEW.is_primary AND NEW.deal_id = OLD.deal_id) THEN
    UPDATE public.deals SET contact_id = NULL WHERE id = OLD.deal_id AND contact_id = OLD.contact_id;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.is_primary THEN
    UPDATE public.deals SET contact_id = NEW.contact_id
    WHERE id = NEW.deal_id AND contact_id IS DISTINCT FROM NEW.contact_id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.deal_contacts_sync_deal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deal_contacts_sync_deal AFTER INSERT OR UPDATE OR DELETE ON public.deal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.deal_contacts_sync_deal();

-- Reverse: old screens write deals.contact_id. A new value becomes (or stays) the primary row;
-- clearing it demotes the primary row but keeps the link (no data dropped).
CREATE OR REPLACE FUNCTION public.deals_sync_primary_contact() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.contact_id IS NOT DISTINCT FROM OLD.contact_id THEN
    RETURN NULL;
  END IF;
  IF NEW.contact_id IS NULL THEN
    UPDATE public.deal_contacts SET is_primary = false WHERE deal_id = NEW.id AND is_primary;
  ELSE
    INSERT INTO public.deal_contacts (deal_id, contact_id, org_id, is_primary)
    VALUES (NEW.id, NEW.contact_id, NEW.org_id, true)
    ON CONFLICT (deal_id, contact_id) DO UPDATE SET is_primary = true WHERE NOT public.deal_contacts.is_primary;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.deals_sync_primary_contact() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deals_sync_primary_contact AFTER INSERT OR UPDATE OF contact_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_sync_primary_contact();

-- 4. Backfill --------------------------------------------------------------------------------------
-- Fail loudly (nothing applied) if a deal points at a contact of another org: the org rule above would reject it.
DO $$ DECLARE v text; BEGIN
  SELECT string_agg(d.id::text, ', ') INTO v
  FROM public.deals d JOIN public.contacts c ON c.id = d.contact_id WHERE c.org_id <> d.org_id;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'Deals met een contact uit een andere organisatie (eerst handmatig oplossen): %', v;
  END IF;
END $$;

-- Rows equal deals.contact_id, so deal_contacts_sync_deal leaves deals untouched (updated_at too).
INSERT INTO public.deal_contacts (deal_id, contact_id, org_id, is_primary)
SELECT d.id, d.contact_id, d.org_id, true FROM public.deals d WHERE d.contact_id IS NOT NULL;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.funnels LOOP PERFORM public.crm_seed_builtin_fields(r.id); END LOOP;
END $$;

-- 5. Verify ----------------------------------------------------------------------------------------
DO $$ DECLARE r record; v_after jsonb; BEGIN
  FOR r IN SELECT * FROM _crm_counts_before_fields LOOP
    v_after := public.crm_integrity_counts(r.org_id);
    IF r.counts <> v_after THEN
      RAISE EXCEPTION 'Integriteitscontrole mislukt voor org %: voor=% na=%', r.org_id, r.counts, v_after;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.organizations) <> (SELECT count(*) FROM _crm_counts_before_fields) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: aantal organisaties veranderd';
  END IF;
  IF (SELECT count(*) FROM public.deal_contacts) <> (SELECT count(*) FROM public.deals WHERE contact_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.deals d WHERE d.contact_id IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM public.deal_contacts dc WHERE dc.deal_id = d.id AND dc.contact_id = d.contact_id AND dc.is_primary)) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: deal_contacts wijkt af van deals.contact_id';
  END IF;
  IF EXISTS (SELECT 1 FROM public.funnels f WHERE (SELECT count(*) FROM public.crm_fields c WHERE c.funnel_id = f.id AND c.builtin) <> 9) THEN
    RAISE EXCEPTION 'Integriteitscontrole mislukt: funnel zonder 9 ingebouwde velden';
  END IF;
END $$;

DO $$ BEGIN
  RAISE NOTICE '=== CRM velden migratie-rapport ===';
  RAISE NOTICE 'deal_contacts aangemaakt (primair): %', (SELECT count(*) FROM public.deal_contacts);
  RAISE NOTICE 'ingebouwde velden: % funnels x 9 = % rijen', (SELECT count(*) FROM public.funnels),
    (SELECT count(*) FROM public.crm_fields WHERE builtin);
END $$;
