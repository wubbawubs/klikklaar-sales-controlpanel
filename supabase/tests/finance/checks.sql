-- Finance access checks. Run after live schema + fixtures + migrations.
-- Seed (as superuser)
INSERT INTO finance_companies (id, name, excluded) VALUES
 ('00000000-0000-0000-0000-0000000000c1','A',false),('00000000-0000-0000-0000-0000000000c2','B',false),('00000000-0000-0000-0000-0000000000c3','C',true);
INSERT INTO finance_access (user_id, level) VALUES ('00000000-0000-0000-0000-0000000000f2','view'),('00000000-0000-0000-0000-0000000000f3','manage');
INSERT INTO finance_company_access (user_id, company_id) VALUES ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3');

BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 3 THEN RAISE EXCEPTION 'check visible_f1: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 1 THEN RAISE EXCEPTION 'check visible_f2: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 1 THEN RAISE EXCEPTION 'check visible_f3: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f4','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 0 THEN RAISE EXCEPTION 'check visible_f4: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f5','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 0 THEN RAISE EXCEPTION 'check visible_f5: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM finance_me();
  IF r.has_access IS DISTINCT FROM true OR r.level IS DISTINCT FROM 'manage' OR r.is_super_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'check finance_me f1: got %,%,%', r.has_access, r.level, r.is_super_admin; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM finance_me();
  IF r.has_access IS DISTINCT FROM true OR r.level IS DISTINCT FROM 'view' OR r.is_super_admin IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'check finance_me f2: got %,%,%', r.has_access, r.level, r.is_super_admin; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f4','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM finance_me();
  IF r.has_access IS DISTINCT FROM false OR r.level IS DISTINCT FROM NULL::text OR r.is_super_admin IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'check finance_me f4: got %,%,%', r.has_access, r.level, r.is_super_admin; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE finance_companies SET min_buffer=1 WHERE id='00000000-0000-0000-0000-0000000000c1'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'check update f2 on c1: % rows', n; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE finance_companies SET min_buffer=1 WHERE id='00000000-0000-0000-0000-0000000000c1'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'check update f3 on c1: % rows', n; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE finance_companies SET min_buffer=1 WHERE id='00000000-0000-0000-0000-0000000000c2'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'check update f3 on c2: % rows', n; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_company_access (user_id, company_id) VALUES ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c2');
    RAISE EXCEPTION 'check access_write: f3 insert should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN INSERT INTO finance_company_access (user_id, company_id) VALUES ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c2'); END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM finance_access) <> 1 OR (SELECT count(*) FROM finance_access WHERE user_id <> '00000000-0000-0000-0000-0000000000f2') <> 0 THEN RAISE EXCEPTION 'check finance_access f2 own row'; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_access) <> 2 THEN RAISE EXCEPTION 'check finance_access f1 all'; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE finance_companies SET excluded=true WHERE id='00000000-0000-0000-0000-0000000000c1';
    RAISE EXCEPTION 'check guard: f3 excluded update should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE finance_companies SET min_buffer=5, ownership_pct=50 WHERE id='00000000-0000-0000-0000-0000000000c1';
  IF (SELECT min_buffer FROM finance_companies WHERE id='00000000-0000-0000-0000-0000000000c1') <> 5 THEN RAISE EXCEPTION 'check guard: f3 min_buffer'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  UPDATE finance_companies SET excluded=true WHERE id='00000000-0000-0000-0000-0000000000c1';
  IF NOT (SELECT excluded FROM finance_companies WHERE id='00000000-0000-0000-0000-0000000000c1') THEN RAISE EXCEPTION 'check guard: f1 excluded'; END IF;
END $$;
ROLLBACK;
-- ===== Task 2: data tables =====
INSERT INTO finance_monthly (company_id, month) VALUES ('00000000-0000-0000-0000-0000000000c1','2026-10-01'),('00000000-0000-0000-0000-0000000000c2','2026-10-01');
INSERT INTO finance_bank_accounts (company_id, account_code, name, balance) VALUES ('00000000-0000-0000-0000-0000000000c1','1','Bank A',100),('00000000-0000-0000-0000-0000000000c2','1','Bank B',200);
INSERT INTO finance_open_items (company_id, kind, exact_id, counterparty, amount) VALUES ('00000000-0000-0000-0000-0000000000c1','receivable','r1','Klant A',50),('00000000-0000-0000-0000-0000000000c2','receivable','r2','Klant B',60);
INSERT INTO finance_exact_connection (id, access_token) VALUES (1,'secret');

BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM finance_open_items) <> 1 OR (SELECT count(*) FROM finance_open_items WHERE company_id <> '00000000-0000-0000-0000-0000000000c1') <> 0 THEN RAISE EXCEPTION 'check data f2 open_items'; END IF;
  IF (SELECT count(*) FROM finance_monthly) <> 1 OR (SELECT count(*) FROM finance_monthly WHERE company_id <> '00000000-0000-0000-0000-0000000000c1') <> 0 THEN RAISE EXCEPTION 'check data f2 monthly'; END IF;
  IF (SELECT count(*) FROM finance_bank_accounts) <> 1 OR (SELECT count(*) FROM finance_bank_accounts WHERE company_id <> '00000000-0000-0000-0000-0000000000c1') <> 0 THEN RAISE EXCEPTION 'check data f2 bank'; END IF;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_fixed_costs (company_id,name,category,monthly_amount) VALUES ('00000000-0000-0000-0000-0000000000c1','X','software',10);
    RAISE EXCEPTION 'check fixed_costs f2 A: should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN INSERT INTO finance_fixed_costs (company_id,name,category,monthly_amount) VALUES ('00000000-0000-0000-0000-0000000000c1','X','software',10); END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_fixed_costs (company_id,name,category,monthly_amount) VALUES ('00000000-0000-0000-0000-0000000000c2','X','software',10);
    RAISE EXCEPTION 'check fixed_costs f3 B: should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_targets (company_id,month,target) VALUES ('00000000-0000-0000-0000-0000000000c1','2026-11-01',10);
    RAISE EXCEPTION 'check targets f2: should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN INSERT INTO finance_targets (company_id,month,target) VALUES ('00000000-0000-0000-0000-0000000000c1','2026-11-01',10); END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_monthly (company_id,month) VALUES ('00000000-0000-0000-0000-0000000000c1','2026-09-01');
    RAISE EXCEPTION 'check monthly write: should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_monthly (company_id,month) VALUES ('00000000-0000-0000-0000-0000000000c1','2026-09-01');
    RAISE EXCEPTION 'check monthly write super: should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_open_items (company_id,kind,exact_id,counterparty,amount) VALUES ('00000000-0000-0000-0000-0000000000c1','payable','p1','Lev',1);
    RAISE EXCEPTION 'check open_items write: should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    IF (SELECT count(*) FROM finance_exact_connection) <> 0 THEN RAISE EXCEPTION 'check exact_connection: f1 sees rows'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  INSERT INTO finance_fixed_costs (company_id,name,category,monthly_amount) VALUES ('00000000-0000-0000-0000-0000000000c1','HubSpot Sales Pro','software',450);
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM notifications WHERE user_id='00000000-0000-0000-0000-0000000000f1') <> 1 OR (SELECT count(*) FROM notifications WHERE user_id='00000000-0000-0000-0000-0000000000f2') <> 1 THEN RAISE EXCEPTION 'check notify: f1/f2 must get exactly one'; END IF;
  IF EXISTS (SELECT 1 FROM notifications WHERE user_id IN ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000f5')) THEN RAISE EXCEPTION 'check notify: f3/f4/f5 must get none'; END IF;
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE user_id='00000000-0000-0000-0000-0000000000f2' AND title='Nieuwe maandlast' AND type='info' AND action_url='/finance/liquiditeit'
     AND body='Fien Manager heeft een nieuwe maandlast toegevoegd: HubSpot Sales Pro, € 450 p/m.') THEN
    RAISE EXCEPTION 'check notify: content wrong: %', (SELECT body FROM notifications WHERE user_id='00000000-0000-0000-0000-0000000000f2'); END IF;
END $$;
ROLLBACK;

DO $$ BEGIN
  IF can_view_finance('00000000-0000-0000-0000-0000000000f5') IS NOT TRUE THEN RAISE EXCEPTION 'check can_view_finance(f5) must stay true'; END IF;
  RAISE NOTICE 'FINANCE CHECKS PASSED';
END $$;
