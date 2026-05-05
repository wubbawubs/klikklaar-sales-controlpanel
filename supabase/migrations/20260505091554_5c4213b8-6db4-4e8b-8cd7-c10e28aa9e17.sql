-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  subdomain text UNIQUE,
  logo_url text,
  primary_color_hex text DEFAULT '#0F9B7A',
  accent_color_hex text DEFAULT '#0F9B7A',
  modules text[] NOT NULL DEFAULT ARRAY['dashboard','closer','forecasting','leads'],
  pipedrive_api_token text,
  pipedrive_company_domain text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view organizations"
  ON public.organizations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER <-> ORG MEMBERSHIP ============
CREATE TABLE public.user_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX idx_user_orgs_user ON public.user_organizations(user_id);
CREATE INDEX idx_user_orgs_org ON public.user_organizations(organization_id);

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own memberships"
  ON public.user_organizations FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins manage memberships"
  ON public.user_organizations FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Helper
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = _user_id AND organization_id = _org_id
  ) OR public.is_admin(_user_id)
$$;

-- ============ SEED 3 BRANDS ============
INSERT INTO public.organizations (slug, name, subdomain, primary_color_hex, accent_color_hex, modules)
VALUES
  ('klikklaar', 'KlikKlaar', 'sales',
    '#0F9B7A', '#0F9B7A',
    ARRAY['dashboard','closer','forecasting','leads','sales_executives','training','evaluations']),
  ('one-time-recruit', 'One-Time Recruit', 'otr',
    '#1E3A8A', '#3B82F6',
    ARRAY['dashboard','closer','forecasting']),
  ('one-idea', 'One-IDEA', 'oneidea',
    '#7C3AED', '#A78BFA',
    ARRAY['dashboard','closer','forecasting'])
ON CONFLICT (slug) DO NOTHING;

-- ============ ADD organization_id TO CORE TABLES ============
DO $$
DECLARE
  v_kk uuid;
  t text;
BEGIN
  SELECT id INTO v_kk FROM public.organizations WHERE slug = 'klikklaar';

  FOREACH t IN ARRAY ARRAY[
    'sales_executives','calls','pipedrive_lead_assignments',
    'closer_appointments','funnel_events','eod_submissions',
    'signals','integration_configs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
    EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL', t, v_kk);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_org ON public.%I(organization_id)', t, t);
  END LOOP;
END $$;

-- ============ BACKFILL MEMBERSHIPS for existing users -> KlikKlaar default ============
INSERT INTO public.user_organizations (user_id, organization_id, role, is_default)
SELECT p.user_id, o.id, 'member', true
FROM public.profiles p
CROSS JOIN public.organizations o
WHERE o.slug = 'klikklaar'
ON CONFLICT (user_id, organization_id) DO NOTHING;