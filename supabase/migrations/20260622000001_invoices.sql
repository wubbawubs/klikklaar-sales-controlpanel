-- Invoices in the control panel (internal finance module, own Supabase).
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  number text,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','overdue')),
  description text,
  issued_at date DEFAULT current_date,
  due_at date,
  paid_at date,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(org_id);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage invoices" ON public.invoices;
CREATE POLICY "Org members manage invoices" ON public.invoices FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));
