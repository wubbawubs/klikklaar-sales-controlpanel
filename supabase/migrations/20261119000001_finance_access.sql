BEGIN;

-- Finance-module: toegangsmodel per gebruiker en bedrijf. can_view_finance() (Growth) blijft ongewijzigd.

CREATE TABLE public.finance_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exact_division int UNIQUE,
  name text NOT NULL,
  legal_name text,
  ownership_pct numeric(5,2) NOT NULL DEFAULT 100 CHECK (ownership_pct BETWEEN 0 AND 100),
  min_buffer numeric NOT NULL DEFAULT 0,
  excluded boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.finance_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('view','manage')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.finance_company_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);

CREATE TRIGGER finance_companies_updated_at
  BEFORE UPDATE ON public.finance_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.finance_can_view(_uid uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'super_admin')
    OR (
      EXISTS (SELECT 1 FROM public.finance_access fa WHERE fa.user_id = _uid)
      AND EXISTS (SELECT 1 FROM public.finance_company_access ca WHERE ca.user_id = _uid AND ca.company_id = _company)
      AND EXISTS (SELECT 1 FROM public.finance_companies c WHERE c.id = _company AND NOT c.excluded)
    );
$$;

CREATE OR REPLACE FUNCTION public.finance_can_manage(_uid uuid, _company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'super_admin')
    OR (
      EXISTS (SELECT 1 FROM public.finance_access fa WHERE fa.user_id = _uid AND fa.level = 'manage')
      AND EXISTS (SELECT 1 FROM public.finance_company_access ca WHERE ca.user_id = _uid AND ca.company_id = _company)
      AND EXISTS (SELECT 1 FROM public.finance_companies c WHERE c.id = _company AND NOT c.excluded)
    );
$$;

CREATE OR REPLACE FUNCTION public.finance_has_access(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'super_admin')
    OR EXISTS (SELECT 1 FROM public.finance_access fa WHERE fa.user_id = _uid);
$$;

CREATE OR REPLACE FUNCTION public.finance_me()
RETURNS TABLE (has_access boolean, level text, is_super_admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT true, 'manage'::text, true WHERE public.has_role(auth.uid(), 'super_admin')
  UNION ALL
  SELECT fa.user_id IS NOT NULL, fa.level, false
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.finance_access fa ON fa.user_id = u.uid
  WHERE NOT public.has_role(auth.uid(), 'super_admin');
$$;

REVOKE EXECUTE ON FUNCTION public.finance_can_view(uuid, uuid), public.finance_can_manage(uuid, uuid),
  public.finance_has_access(uuid), public.finance_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_can_view(uuid, uuid), public.finance_can_manage(uuid, uuid),
  public.finance_has_access(uuid), public.finance_me() TO authenticated;

ALTER TABLE public.finance_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_company_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_companies_select ON public.finance_companies FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), id));
CREATE POLICY finance_companies_update ON public.finance_companies FOR UPDATE TO authenticated
  USING (public.finance_can_manage(auth.uid(), id)) WITH CHECK (public.finance_can_manage(auth.uid(), id));
CREATE POLICY finance_companies_insert ON public.finance_companies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY finance_companies_delete ON public.finance_companies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY finance_access_select ON public.finance_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY finance_access_write ON public.finance_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY finance_company_access_select ON public.finance_company_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY finance_company_access_write ON public.finance_company_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_companies, public.finance_access, public.finance_company_access TO authenticated;

COMMIT;
