-- Demo-data voor de LOKALE finance-omgeving (scripts/finance-local.sh). Nooit op productie draaien.
-- Verwacht dat de vier demo-gebruikers al in auth.users staan (aangemaakt via de GoTrue admin API).
-- Herhaalbaar: wist eerst de finance-demodata.
BEGIN;

ALTER TABLE public.finance_fixed_costs DISABLE TRIGGER finance_fixed_costs_notify;  -- geen meldingen bij seeden

DELETE FROM public.finance_companies;  -- cascade naar alle finance-tabellen en toegang
DELETE FROM public.finance_access;
DELETE FROM public.notifications;

-- Gebruikers: rollen, profielen, finance-toegang
DO $$
DECLARE
  u_super uuid := (SELECT id FROM auth.users WHERE email = 'super@demo.local');
  u_kijker uuid := (SELECT id FROM auth.users WHERE email = 'kijker@demo.local');
  u_beheer uuid := (SELECT id FROM auth.users WHERE email = 'beheer@demo.local');
  u_sales uuid := (SELECT id FROM auth.users WHERE email = 'sales@demo.local');
BEGIN
  IF u_super IS NULL OR u_kijker IS NULL OR u_beheer IS NULL OR u_sales IS NULL THEN
    RAISE EXCEPTION 'demo-gebruikers ontbreken in auth.users';
  END IF;
  DELETE FROM public.user_roles WHERE user_id IN (u_super, u_kijker, u_beheer, u_sales);
  INSERT INTO public.user_roles (user_id, role) VALUES
    (u_super, 'super_admin'), (u_kijker, 'admin'), (u_beheer, 'admin'), (u_sales, 'sales_executive');
  DELETE FROM public.profiles WHERE user_id IN (u_super, u_kijker, u_beheer, u_sales);
  INSERT INTO public.profiles (user_id, full_name, email) VALUES
    (u_super, 'Sanne Super', 'super@demo.local'), (u_kijker, 'Kees Kijker', 'kijker@demo.local'),
    (u_beheer, 'Bea Beheer', 'beheer@demo.local'), (u_sales, 'Sam Sales', 'sales@demo.local');
  INSERT INTO public.finance_access (user_id, level) VALUES (u_kijker, 'view'), (u_beheer, 'manage');
END $$;

-- Bedrijven (laatste is uitgesloten; Wantveld heeft een sync-fout)
INSERT INTO public.finance_companies (id, exact_division, name, legal_name, ownership_pct, min_buffer, excluded, last_synced_at, sync_error) VALUES
 ('c0000000-0000-0000-0000-000000000001', 1001, 'KlikKlaar SEO', 'KlikKlaar SEO B.V.', 100, 25000, false, now() - interval '35 minutes', NULL),
 ('c0000000-0000-0000-0000-000000000002', 1002, 'Mandate',       'Mandate B.V.',        60,  15000, false, now() - interval '35 minutes', NULL),
 ('c0000000-0000-0000-0000-000000000003', 1003, 'LabelLift',     'LabelLift B.V.',     100,  10000, false, now() - interval '35 minutes', NULL),
 ('c0000000-0000-0000-0000-000000000004', 1004, 'LeadLayer',     'LeadLayer B.V.',      50,   8000, false, now() - interval '2 hours', NULL),
 ('c0000000-0000-0000-0000-000000000005', 1005, 'Wantveld',      'Wantveld B.V.',       30,   5000, false, now() - interval '3 days', 'Exact: refresh token ongeldig (invalid_grant)'),
 ('c0000000-0000-0000-0000-000000000006', 1006, 'Oud Holding (uitgesloten)', 'Oud Holding B.V.', 100, 0, true, NULL, NULL);

-- Toegang: kijker -> 2 bedrijven (view), beheer -> 3 bedrijven
INSERT INTO public.finance_company_access (user_id, company_id)
SELECT u.id, c.id FROM auth.users u, public.finance_companies c
WHERE (u.email = 'kijker@demo.local' AND c.exact_division IN (1001, 1002))
   OR (u.email = 'beheer@demo.local' AND c.exact_division IN (1002, 1003, 1004));

-- 23 maanden omzet/kosten (huidige maand + 22 terug), deterministisch
INSERT INTO public.finance_monthly (company_id, month, revenue, costs, synced_at)
SELECT c.id,
       (date_trunc('month', current_date) - make_interval(months => i))::date,
       round((base.rev * (1 + 0.25 * sin((23 - i) / 2.5 + c.exact_division) + 0.012 * (23 - i)))::numeric, 2),
       round((base.rev * (0.72 + 0.1 * cos((23 - i) / 3.0 + c.exact_division)))::numeric, 2),
       now()
FROM public.finance_companies c
JOIN (VALUES (1001, 62000), (1002, 41000), (1003, 28000), (1004, 19000), (1005, 9000), (1006, 5000)) AS base(div, rev)
  ON base.div = c.exact_division
CROSS JOIN generate_series(0, 22) AS i
WHERE c.exact_division <> 1005 OR i > 0;  -- Wantveld: huidige maand ontbreekt door de sync-fout

-- Bankrekeningen (LeadLayer zakelijk: laatste afschrift 12 dagen oud)
INSERT INTO public.finance_bank_accounts (company_id, account_code, name, balance, last_statement_date, synced_at)
SELECT c.id, v.code, v.name, v.balance, current_date - v.age, now()
FROM public.finance_companies c
JOIN (VALUES
  (1001, '1010', 'ING Zakelijk',        84250.40, 1),
  (1001, '1020', 'ING Spaarrekening',  120000.00, 1),
  (1002, '1010', 'ING Zakelijk',        36120.75, 2),
  (1003, '1010', 'ING Zakelijk',        18400.10, 1),
  (1004, '1010', 'ING Zakelijk',         9150.00, 12),
  (1005, '1010', 'ING Zakelijk',         2310.55, 3),
  (1006, '1010', 'ING Zakelijk',          500.00, 40)
) AS v(div, code, name, balance, age) ON v.div = c.exact_division;

-- ~30 open posten (deels te laat)
INSERT INTO public.finance_open_items (company_id, kind, exact_id, invoice_number, counterparty, amount, invoice_date, due_date, synced_at)
SELECT c.id,
       CASE WHEN n % 3 = 0 THEN 'payable' ELSE 'receivable' END,
       'demo-' || c.exact_division || '-' || n,
       '2026-' || lpad((c.exact_division * 10 + n)::text, 5, '0'),
       (ARRAY['Bakkerij Jansen','Cafe De Hoek','Studio Noord','Techniek Totaal','Hotel Aurora','Van Dijk Advies','Bloemen Bos'])[1 + (n + c.exact_division) % 7],
       round((350 + ((n * 977 + c.exact_division * 131) % 7800))::numeric, 2),
       current_date + (n * 9 - 45 - 30),
       current_date + (n * 9 - 45),   -- n=1..6: tussen 36 dagen te laat en 9 dagen vooruit
       now()
FROM public.finance_companies c CROSS JOIN generate_series(1, 6) AS n
WHERE c.exact_division <= 1005;

-- Targets dit jaar
INSERT INTO public.finance_targets (company_id, month, target)
SELECT c.id, make_date(extract(year FROM current_date)::int, m, 1), t.target
FROM public.finance_companies c
JOIN (VALUES (1001, 70000), (1002, 45000), (1003, 30000), (1004, 22000), (1005, 10000)) AS t(div, target) ON t.div = c.exact_division
CROSS JOIN generate_series(1, 12) AS m;

-- 8 vaste lasten + leveranciersuitgaven (HubSpot wijkt af: factuur veel hoger dan de ingevoerde maandlast)
INSERT INTO public.finance_fixed_costs (company_id, name, category, monthly_amount, exact_supplier_code, active, created_by)
SELECT c.id, v.name, v.category, v.amount, v.code, true, NULL
FROM public.finance_companies c
JOIN (VALUES
  (1001, 'Kantoorhuur Utrecht',   'huisvesting',  2400, 'SUP-HUUR'),
  (1001, 'HubSpot Sales Pro',     'software',      450, 'SUP-HUBSPOT'),
  (1001, 'Salarissen team',       'personeel',   28000, NULL),
  (1002, 'Google Workspace',      'software',      180, 'SUP-GOOGLE'),
  (1002, 'Aansprakelijkheid',     'verzekeringen', 210, 'SUP-AON'),
  (1003, 'Facebook Ads',          'marketing',    1500, 'SUP-META'),
  (1004, 'Boekhouder',            'advies',        650, 'SUP-ADV'),
  (1004, 'Notion',                'software',       95, 'SUP-NOTION')
) AS v(div, name, category, amount, code) ON v.div = c.exact_division;

INSERT INTO public.finance_supplier_spend (company_id, supplier_code, supplier_name, last_invoice_date, last_amount)
SELECT c.id, v.code, v.name, current_date - v.age, v.amount
FROM public.finance_companies c
JOIN (VALUES
  (1001, 'SUP-HUUR',    'Vastgoed Utrecht BV', 5, 2400.00),
  (1001, 'SUP-HUBSPOT', 'HubSpot Ireland',     9, 890.00),   -- afwijkend t.o.v. 450 p/m
  (1002, 'SUP-GOOGLE',  'Google Cloud EMEA',   7, 180.00),
  (1002, 'SUP-AON',     'Aon Nederland',      21, 210.00),
  (1003, 'SUP-META',    'Meta Platforms',      3, 1490.00),
  (1004, 'SUP-ADV',     'Boekhoudkantoor Smit',14, 650.00),
  (1004, 'SUP-NOTION',  'Notion Labs',         8, 95.00),
  (1004, 'SUP-ZOOM',    'Zoom Video',          6, 160.00)    -- nog geen vaste last
) AS v(div, code, name, age, amount) ON v.div = c.exact_division;

ALTER TABLE public.finance_fixed_costs ENABLE TRIGGER finance_fixed_costs_notify;

COMMIT;
