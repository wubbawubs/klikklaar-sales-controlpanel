-- Minimal stand-in for the production schema, enough to test apply_meeting_proposal on plain Postgres.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.user_organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id), role text NOT NULL DEFAULT 'member');
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, full_name text, email text);
CREATE TABLE public.companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, source text, created_by uuid,
  deleted_at timestamptz);   -- trash column from 20261104000005
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, company_id uuid REFERENCES companies(id), name text NOT NULL);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','admin')) $$;
CREATE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.user_organizations WHERE user_id = _user_id AND organization_id = _org_id) OR public.is_admin(_user_id) $$;
-- Funnels + stage types as added by 20261104000001_crm_funnels.sql (incl. its two admin policies, replaced by 20261104000002).
CREATE TABLE public.funnels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  position int NOT NULL DEFAULT 0, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view funnels" ON public.funnels FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins create funnels" ON public.funnels FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND public.is_admin(auth.uid()));
CREATE POLICY "Admins update funnels" ON public.funnels FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) AND public.is_admin(auth.uid()))
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND public.is_admin(auth.uid()));
CREATE TABLE public.pipeline_stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, name text NOT NULL, position int NOT NULL, color text,
  funnel_id uuid NOT NULL REFERENCES funnels(id), stage_type text NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')));
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  company_id uuid REFERENCES companies(id), contact_id uuid REFERENCES contacts(id), stage_id uuid REFERENCES pipeline_stages(id),
  funnel_id uuid NOT NULL REFERENCES funnels(id),
  title text NOT NULL, value_eur numeric(12,2), assigned_to uuid REFERENCES auth.users(id),
  stage_updated_at timestamptz DEFAULT now(), won_at timestamptz, lost_at timestamptz, lost_reason text,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz);   -- trash column from 20261104000005
-- Like 20261104000001's deals_funnel_default: a new deal takes the funnel of its stage.
CREATE FUNCTION public.deals_funnel_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.funnel_id IS NULL THEN SELECT funnel_id INTO NEW.funnel_id FROM public.pipeline_stages WHERE id = NEW.stage_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deals_funnel_default BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.deals_funnel_default();
CREATE TABLE public.deal_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('note','call','email','meeting','stage_change')), body text, meta jsonb, created_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid, action_type text NOT NULL, entity_type text NOT NULL, entity_id text, before_json jsonb, after_json jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.crm_appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, deal_id uuid REFERENCES deals(id), company_id uuid, contact_id uuid,
  owner_id uuid NOT NULL REFERENCES auth.users(id), type text NOT NULL CHECK (type IN ('call','meeting')), title text NOT NULL, starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 30, location text, notes text, status text NOT NULL DEFAULT 'planned', created_by uuid);
-- Like production: normal users cannot touch audit_logs directly.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
