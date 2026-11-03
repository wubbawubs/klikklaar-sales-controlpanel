-- Minimal stand-in for the production schema, enough to test apply_meeting_proposal on plain Postgres.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.user_organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id));
CREATE TABLE public.profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, full_name text, email text);
CREATE TABLE public.companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, source text, created_by uuid);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, company_id uuid REFERENCES companies(id), name text NOT NULL);
CREATE TABLE public.pipeline_stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, name text NOT NULL, position int NOT NULL, color text);
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  company_id uuid REFERENCES companies(id), contact_id uuid REFERENCES contacts(id), stage_id uuid REFERENCES pipeline_stages(id),
  title text NOT NULL, value_eur numeric(12,2), assigned_to uuid REFERENCES auth.users(id),
  stage_updated_at timestamptz DEFAULT now(), won_at timestamptz, lost_at timestamptz, lost_reason text,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
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
