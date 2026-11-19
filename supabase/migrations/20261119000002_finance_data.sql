BEGIN;

-- Finance-module: data-tabellen (sync door service role), targets, vaste lasten, Exact-verbinding.

CREATE TABLE public.finance_monthly (
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  month date NOT NULL, -- eerste dag van de maand
  revenue numeric NOT NULL DEFAULT 0,
  costs numeric NOT NULL DEFAULT 0, -- positief getal
  synced_at timestamptz,
  PRIMARY KEY (company_id, month)
);

CREATE TABLE public.finance_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  name text NOT NULL,
  balance numeric NOT NULL,
  last_statement_date date,
  synced_at timestamptz,
  UNIQUE (company_id, account_code)
);

CREATE TABLE public.finance_open_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  kind text CHECK (kind IN ('receivable','payable')),
  exact_id text NOT NULL,
  invoice_number text,
  counterparty text NOT NULL,
  amount numeric NOT NULL,
  invoice_date date,
  due_date date,
  synced_at timestamptz,
  UNIQUE (company_id, kind, exact_id)
);

CREATE TABLE public.finance_supplier_spend (
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  supplier_code text NOT NULL,
  supplier_name text,
  last_invoice_date date,
  last_amount numeric,
  PRIMARY KEY (company_id, supplier_code)
);

CREATE TABLE public.finance_targets (
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  month date NOT NULL,
  target numeric NOT NULL CHECK (target >= 0),
  PRIMARY KEY (company_id, month)
);

CREATE TABLE public.finance_fixed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.finance_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('personeel','huisvesting','software','marketing','verzekeringen','advies','overig')),
  monthly_amount numeric NOT NULL CHECK (monthly_amount >= 0),
  exact_supplier_code text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER finance_fixed_costs_updated_at
  BEFORE UPDATE ON public.finance_fixed_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.finance_exact_connection (
  id int PRIMARY KEY CHECK (id = 1),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected_by uuid,
  connected_at timestamptz
);

ALTER TABLE public.finance_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_open_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_supplier_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_exact_connection ENABLE ROW LEVEL SECURITY; -- bewust geen policies

-- Gesynchroniseerde tabellen: alleen lezen (service role schrijft)
CREATE POLICY finance_monthly_select ON public.finance_monthly FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), company_id));
CREATE POLICY finance_bank_accounts_select ON public.finance_bank_accounts FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), company_id));
CREATE POLICY finance_open_items_select ON public.finance_open_items FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), company_id));
CREATE POLICY finance_supplier_spend_select ON public.finance_supplier_spend FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), company_id));

CREATE POLICY finance_targets_select ON public.finance_targets FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), company_id));
CREATE POLICY finance_targets_write ON public.finance_targets FOR ALL TO authenticated
  USING (public.finance_can_manage(auth.uid(), company_id)) WITH CHECK (public.finance_can_manage(auth.uid(), company_id));

CREATE POLICY finance_fixed_costs_select ON public.finance_fixed_costs FOR SELECT TO authenticated
  USING (public.finance_can_view(auth.uid(), company_id));
CREATE POLICY finance_fixed_costs_write ON public.finance_fixed_costs FOR ALL TO authenticated
  USING (public.finance_can_manage(auth.uid(), company_id)) WITH CHECK (public.finance_can_manage(auth.uid(), company_id));

GRANT SELECT ON public.finance_monthly, public.finance_bank_accounts, public.finance_open_items,
  public.finance_supplier_spend TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_targets, public.finance_fixed_costs TO authenticated;
REVOKE ALL ON public.finance_exact_connection FROM anon, authenticated;

-- Melding bij nieuwe maandlast
CREATE OR REPLACE FUNCTION public.finance_notify_new_fixed_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_amount text;
BEGIN
  SELECT coalesce(nullif(p.full_name, ''), p.email) INTO v_name FROM public.profiles p WHERE p.user_id = NEW.created_by LIMIT 1;
  v_name := coalesce(v_name, 'Een collega');
  v_amount := replace(to_char(round(NEW.monthly_amount), 'FM999,999,990'), ',', '.'); -- NL-duizendtal, locale-onafhankelijk

  INSERT INTO public.notifications (user_id, title, body, type, action_url)
  SELECT r.user_id, 'Nieuwe maandlast',
         v_name || ' heeft een nieuwe maandlast toegevoegd: ' || NEW.name || ', € ' || v_amount || ' p/m.',
         'info', '/finance/liquiditeit'
  FROM (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'super_admin'
    UNION
    SELECT fa.user_id FROM public.finance_access fa
      JOIN public.finance_company_access ca ON ca.user_id = fa.user_id AND ca.company_id = NEW.company_id
  ) r
  WHERE r.user_id IS DISTINCT FROM NEW.created_by;
  RETURN NEW;
END $$;

CREATE TRIGGER finance_fixed_costs_notify
  AFTER INSERT ON public.finance_fixed_costs
  FOR EACH ROW EXECUTE FUNCTION public.finance_notify_new_fixed_cost();

COMMIT;
