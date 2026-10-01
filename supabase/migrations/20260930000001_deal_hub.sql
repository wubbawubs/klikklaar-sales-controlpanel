-- Deal Hub: company-level prep/intake items + CRM appointments (calls/meetings).

CREATE TABLE IF NOT EXISTS public.company_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('note','document')),
  category text NOT NULL DEFAULT 'preparation' CHECK (category IN ('preparation','intake','other')),
  title text,
  body text,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_items_company_idx ON public.company_items (company_id, created_at DESC);
ALTER TABLE public.company_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage company items" ON public.company_items;
CREATE POLICY "Org members manage company items" ON public.company_items FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
DROP TRIGGER IF EXISTS update_company_items_updated_at ON public.company_items;
CREATE TRIGGER update_company_items_updated_at BEFORE UPDATE ON public.company_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.crm_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('call','meeting')),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 30,
  location text,
  notes text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled','no_show')),
  outcome text,
  external_id text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_appointments_org_start_idx ON public.crm_appointments (org_id, starts_at);
CREATE INDEX IF NOT EXISTS crm_appointments_owner_start_idx ON public.crm_appointments (owner_id, starts_at);
CREATE INDEX IF NOT EXISTS crm_appointments_deal_idx ON public.crm_appointments (deal_id);
ALTER TABLE public.crm_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage appointments" ON public.crm_appointments;
CREATE POLICY "Org members manage appointments" ON public.crm_appointments FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
DROP TRIGGER IF EXISTS update_crm_appointments_updated_at ON public.crm_appointments;
CREATE TRIGGER update_crm_appointments_updated_at BEFORE UPDATE ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private bucket for prep/intake documents; path = '{org_id}/{company_id}/{file}'.
INSERT INTO storage.buckets (id, name, public) VALUES ('company-documents', 'company-documents', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "company docs read" ON storage.objects;
CREATE POLICY "company docs read" ON storage.objects FOR SELECT
  USING (bucket_id = 'company-documents' AND (storage.foldername(name))[1]::uuid IN
    (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "company docs insert" ON storage.objects;
CREATE POLICY "company docs insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-documents' AND (storage.foldername(name))[1]::uuid IN
    (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "company docs delete" ON storage.objects;
CREATE POLICY "company docs delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'company-documents' AND (storage.foldername(name))[1]::uuid IN
    (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
