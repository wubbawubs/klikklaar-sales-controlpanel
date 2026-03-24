
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'coach', 'sales_executive');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin', 'admin'))
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sales Executives
CREATE TABLE public.sales_executives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email TEXT NOT NULL,
  phone TEXT,
  start_date DATE,
  external_guest_email TEXT,
  external_access_required BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','onboarding','offboarded')),
  coach_user_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sales_executives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and coaches can view SEs" ON public.sales_executives FOR SELECT USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Admins can manage SEs" ON public.sales_executives FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_se_updated_at BEFORE UPDATE ON public.sales_executives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_executive_id UUID REFERENCES public.sales_executives(id) ON DELETE CASCADE NOT NULL,
  workspace_name TEXT NOT NULL,
  workspace_slug TEXT,
  sharepoint_site_name TEXT,
  sharepoint_site_url TEXT,
  sharepoint_status TEXT DEFAULT 'draft' CHECK (sharepoint_status IN ('draft','configured','artifacts_generated','ready','executed','failed','manual_action_required')),
  provisioning_mode TEXT DEFAULT 'design_only' CHECK (provisioning_mode IN ('design_only','export_package','controlled_execution')),
  permission_status TEXT DEFAULT 'pending',
  eod_typeform_url TEXT,
  eod_display_mode TEXT DEFAULT 'embedded' CHECK (eod_display_mode IN ('embedded','external_link')),
  include_training_library BOOLEAN DEFAULT true,
  include_lead_list BOOLEAN DEFAULT true,
  include_excel_import BOOLEAN DEFAULT false,
  product_lines TEXT[] DEFAULT ARRAY['KlikklaarSEO'],
  deal_registration_enabled BOOLEAN DEFAULT true,
  appointment_scheduling_enabled BOOLEAN DEFAULT true,
  account_management_enabled BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage workspaces" ON public.workspaces FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Coaches can view workspaces" ON public.workspaces FOR SELECT USING (public.has_role(auth.uid(), 'coach'));
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workspace Templates
CREATE TABLE public.workspace_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  sharepoint_template_json JSONB DEFAULT '{}',
  power_automate_template_json JSONB DEFAULT '{}',
  integration_template_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.workspace_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage templates" ON public.workspace_templates FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Auth users can view templates" ON public.workspace_templates FOR SELECT USING (auth.uid() IS NOT NULL);

-- Provisioning Jobs
CREATE TABLE public.provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','manual_action_required')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  execution_log JSONB DEFAULT '[]',
  manual_actions_required TEXT[],
  artifact_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.provisioning_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage jobs" ON public.provisioning_jobs FOR ALL USING (public.is_admin(auth.uid()));

-- Generated Artifacts
CREATE TABLE public.generated_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  artifact_format TEXT DEFAULT 'json',
  artifact_content JSONB,
  artifact_text TEXT,
  version TEXT DEFAULT '1.0',
  editable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.generated_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage artifacts" ON public.generated_artifacts FOR ALL USING (public.is_admin(auth.uid()));

-- Integration Configs
CREATE TABLE public.integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('pipedrive','exact','qapitaal','typeform')),
  enabled BOOLEAN DEFAULT false,
  auth_type TEXT DEFAULT 'api_key',
  config_json JSONB DEFAULT '{}',
  status TEXT DEFAULT 'not_configured' CHECK (status IN ('not_configured','ready_for_test','connected','error','manual_action_required')),
  last_tested_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage integrations" ON public.integration_configs FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_ic_updated_at BEFORE UPDATE ON public.integration_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Integration Events
CREATE TABLE public.integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_system TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload_json JSONB,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','completed','failed','retry')),
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage events" ON public.integration_events FOR ALL USING (public.is_admin(auth.uid()));

-- EOD Submissions
CREATE TABLE public.eod_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  sales_executive_id UUID REFERENCES public.sales_executives(id) ON DELETE CASCADE NOT NULL,
  session_date DATE NOT NULL,
  typeform_response_id TEXT,
  submitted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','submitted','reviewed','follow_up_required')),
  summary_json JSONB,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_status TEXT DEFAULT 'none' CHECK (follow_up_status IN ('none','pending','in_progress','completed')),
  coach_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.eod_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and coaches can manage EODs" ON public.eod_submissions FOR ALL USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'coach'));

-- Audit Logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Auth users can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Settings
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value_json JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage settings" ON public.settings FOR ALL USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default template
INSERT INTO public.workspace_templates (template_name, version, description, is_default, sharepoint_template_json, power_automate_template_json) VALUES (
  'Standaard Klikklaar SEO Workspace', '1.0', 'Standaard template met alle modules', true,
  '{"pages":["Startpagina","Lead lijsten","Deals en abonnementen","Afspraken","Training en coaching","End of Day Typeform evaluatie"],"lists":["Leads","Deals","Afspraken","Activiteiten","EOD Status"],"libraries":["Training en coaching"]}',
  '{"flows":["SE Registratie","Workspace Provisioning","SharePoint Lijsten Aanmaken","Permissions Checklist","Beheerlijst Bijwerken","Leadimport","EOD Intake","Integratie Events","Foutafhandeling"]}'
);

-- Default settings
INSERT INTO public.settings (key, value_json) VALUES
  ('default_workspace_name', '"Klikklaar SEO – SE – {naam}"'),
  ('default_sharepoint_naming', '"klikklaar-seo-se-{slug}"'),
  ('default_lead_statuses', '["Nieuw","Gebeld","Geen gehoor","Terugbellen","Interesse","Offerte gewenst","Afspraak ingepland","Niet geïnteresseerd","Afgerond"]'),
  ('default_deal_statuses', '["Nieuw","Gekwalificeerd","Voorstel","Onderhandeling","Gewonnen","Verloren","Actief abonnement","Beëindigd"]'),
  ('default_navigation', '["Start","Lead lijsten","Deals en abonnementen","Afspraken","Training en coaching","End of Day Typeform evaluatie"]');
