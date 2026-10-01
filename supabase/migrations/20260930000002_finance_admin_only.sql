-- Finance + growth goals: admins only. deal_fees stays org-scoped (sales needs deal values).
CREATE OR REPLACE FUNCTION public.can_view_finance(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT public.is_admin(_uid) $$;

DROP POLICY IF EXISTS "Org members manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices" ON public.invoices FOR ALL
  USING (public.can_view_finance(auth.uid())) WITH CHECK (public.can_view_finance(auth.uid()));

DROP POLICY IF EXISTS "Org members manage cash" ON public.cash_positions;
DROP POLICY IF EXISTS "Admins manage cash" ON public.cash_positions;
CREATE POLICY "Admins manage cash" ON public.cash_positions FOR ALL
  USING (public.can_view_finance(auth.uid())) WITH CHECK (public.can_view_finance(auth.uid()));

DROP POLICY IF EXISTS "Org members manage financials" ON public.company_financials;
DROP POLICY IF EXISTS "Admins manage financials" ON public.company_financials;
CREATE POLICY "Admins manage financials" ON public.company_financials FOR ALL
  USING (public.can_view_finance(auth.uid())) WITH CHECK (public.can_view_finance(auth.uid()));

DROP POLICY IF EXISTS "Org members manage contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admins manage contracts" ON public.contracts;
CREATE POLICY "Admins manage contracts" ON public.contracts FOR ALL
  USING (public.can_view_finance(auth.uid())) WITH CHECK (public.can_view_finance(auth.uid()));

DROP POLICY IF EXISTS "Org members manage goals" ON public.growth_goals;
DROP POLICY IF EXISTS "Admins manage goals" ON public.growth_goals;
CREATE POLICY "Admins manage goals" ON public.growth_goals FOR ALL
  USING (public.can_view_finance(auth.uid())) WITH CHECK (public.can_view_finance(auth.uid()));
